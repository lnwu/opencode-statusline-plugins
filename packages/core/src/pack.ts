// Packaging smoke test helper: pack a package with `npm pack`, assert the
// tarball ships the expected entries, check that every bundle only imports
// declared runtime dependencies, install it with production dependencies only
// into a temporary directory, and import its entry points under Bun.
//
// This catches packaging mistakes that in-workspace tests cannot see: missing
// `files` entries, broken `exports`, imports wrongly marked external (for
// example the private `core` workspace package), and undeclared runtime
// dependencies. Peer dependencies are not installed — they belong to OpenCode —
// so TUI entries are covered by the declared-import scan and the integration
// tests instead of the import smoke test.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

export type PackedPackageOptions = {
  /** Package directory containing the package.json to pack. */
  packageDir: string
  /** Tarball-relative files that must ship, e.g. `dist/index.js`. */
  entries: string[]
  /** Package specifiers to import after installation, e.g. `["acme", "acme/rpc"]`. */
  imports?: string[]
}

export type PackedPackage = {
  /** Tarball file list, including the `package/` prefix. */
  files: string[]
}

export async function checkPackedPackage(options: PackedPackageOptions): Promise<PackedPackage> {
  const packageDir = resolve(options.packageDir)
  const workDir = await mkdtemp(join(tmpdir(), "pack-check-"))
  try {
    const tarball = await pack(packageDir, workDir)
    const files = await listTarball(tarball)
    const missing = options.entries
      .map((entry) => `package/${entry}`)
      .filter((entry) => !files.includes(entry))
    if (missing.length > 0) {
      throw new Error(`tarball is missing ${missing.join(", ")}\npacked files:\n${files.join("\n")}`)
    }
    await assertDeclaredImports(packageDir, await extractTarball(tarball, workDir))
    if (options.imports && options.imports.length > 0) {
      await installAndImport(tarball, workDir, options.imports)
    }
    return { files }
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

async function pack(packageDir: string, workDir: string): Promise<string> {
  const result = await run(["npm", "pack", "--pack-destination", workDir], { cwd: packageDir, timeoutMs: 120_000 })
  if (result.code !== 0) throw new Error(`npm pack failed:\n${result.stdout}\n${result.stderr}`)
  const filename = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".tgz"))
    .at(-1)
  if (!filename) throw new Error(`npm pack did not report a tarball:\n${result.stdout}\n${result.stderr}`)
  return join(workDir, filename)
}

async function listTarball(tarball: string): Promise<string[]> {
  const result = await run(["tar", "-tzf", tarball])
  if (result.code !== 0) throw new Error(`tar -tzf failed:\n${result.stderr}`)
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

async function extractTarball(tarball: string, workDir: string): Promise<string> {
  const dir = join(workDir, "extracted")
  await mkdir(dir, { recursive: true })
  const result = await run(["tar", "-xzf", tarball, "-C", dir])
  if (result.code !== 0) throw new Error(`tar -xzf failed:\n${result.stderr}`)
  return dir
}

/** Every bare import in a shipped bundle must be a declared runtime dependency. */
async function assertDeclaredImports(packageDir: string, extractedDir: string): Promise<void> {
  const manifest = (await Bun.file(join(packageDir, "package.json")).json()) as {
    dependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
  }
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ])

  const root = join(extractedDir, "package")
  const undeclared = new Map<string, Set<string>>()
  for await (const file of new Bun.Glob("**/*.js").scan({ cwd: root })) {
    const code = await Bun.file(join(root, file)).text()
    const imports = new Bun.Transpiler({ loader: "js", target: "bun" }).scan(code).imports
    for (const item of imports) {
      const specifier = item.path
      if (specifier.startsWith(".") || specifier.startsWith("/")) continue
      if (specifier.startsWith("node:") || specifier.startsWith("bun:")) continue
      const name = packageNameOf(specifier)
      if (declared.has(name)) continue
      const files = undeclared.get(name) ?? new Set<string>()
      files.add(`package/${file}`)
      undeclared.set(name, files)
    }
  }

  if (undeclared.size > 0) {
    const details = [...undeclared].map(([name, files]) => `${name} (imported by ${[...files].join(", ")})`)
    throw new Error(
      `bundles import packages that are not declared in package.json dependencies or peerDependencies:\n${details.join("\n")}`,
    )
  }
}

function packageNameOf(specifier: string): string {
  const parts = specifier.split("/")
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!
}

async function installAndImport(tarball: string, workDir: string, imports: string[]): Promise<void> {
  const dir = join(workDir, "install")
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ name: "pack-check", private: true, type: "module" }, null, 2) + "\n",
  )

  // Bun is the repo's package manager; a package's own devDependencies never
  // install from a registry tarball, so this exercises runtime dependencies only.
  const install = await run(["bun", "add", tarball], { cwd: dir, timeoutMs: 300_000 })
  if (install.code !== 0) throw new Error(`bun add failed:\n${install.stdout}\n${install.stderr}`)

  const script = join(dir, "import-check.mjs")
  const lines = imports.map((specifier) => `await import(${JSON.stringify(specifier)})`)
  await writeFile(script, `${lines.join("\n")}\n`)
  const imported = await run(["bun", script], { cwd: dir, timeoutMs: 120_000 })
  if (imported.code !== 0) {
    throw new Error(`importing ${imports.join(", ")} failed:\n${imported.stdout}\n${imported.stderr}`)
  }
}

type RunResult = { code: number; stdout: string; stderr: string }

async function run(cmd: string[], options: { cwd?: string; timeoutMs?: number } = {}): Promise<RunResult> {
  const proc = Bun.spawn(cmd, {
    env: process.env,
    cwd: options.cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const timer = options.timeoutMs ? setTimeout(() => proc.kill(), options.timeoutMs) : undefined
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  const code = await proc.exited
  if (timer) clearTimeout(timer)
  return { code, stdout, stderr }
}
