// Integration-test harness factory: drives a real `opencode` TUI against a
// plugin package's working tree and captures the rendered frame for assertions.
//
// Recipe verified against opencode > 2.0.0:
//
// - Credentials live in the server's SQLite database in V2, so `auth.json` is
//   not usable. `opencode service set env <credentialEnv> <key>` registers an
//   environment connection that the plugin resolves to a `key` credential, so
//   the statusline renders live quota without an interactive `/connect`.
// - The plugin is loaded from the isolated *global* plugin directory
//   (`$XDG_CONFIG_HOME/opencode/plugins/<pluginDir>`). A project-scoped plugin
//   renders but its RPC stays unreachable (`RPC is unavailable`), which leaves
//   the statusline at its "no usage" fallback.
// - The managed background service binds a fixed default port (49374). Each
//   case sets its own port so tests stay isolated and do not collide with a
//   developer's running service.
// - The TUI runs with an isolated cli.json that hides the sidebar and the tab
//   strip, and the case root lives under a short `/tmp` path so the footer
//   keeps its directory indicator short.
import { mkdir, rm, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"

const OPENCODE = "opencode"

export type ModelRef = { providerID: string; id: string }
export type Env = Record<string, string | undefined>
export type RunResult = { code: number; stdout: string; stderr: string }
export type RunOptions = { env?: Env; cwd?: string; timeoutMs?: number }
export type ToolCheck = { name: string; args: string[] }

export type CaseSpec = {
  name: string
  width: number
  height: number
  /** Terminal language. `zh-CN` sets LANG/LC_ALL for the TUI process. */
  language?: "en" | "zh-CN"
  model: ModelRef
  /** Send this prompt and require `outcome: succeeded`. */
  prompt?: string
  /** Seed a bogus credential to exercise the "no usage" fallback. */
  credential?: "invalid"
  /** Extra providers for the test project config. */
  providers?: Record<string, unknown>
  /** The frame must match every pattern. */
  expect: RegExp[]
  /** The frame must match none of these patterns. */
  reject?: RegExp[]
  /** Seconds to wait after the first `expect` matches before the final capture. */
  settleSeconds?: number
}

export type HarnessConfig = {
  /** Plugin package root; artifacts default under `<root>/test/e2e/.artifacts`. */
  packageRoot: string
  /** Server plugin entry: the built `dist/index.js` that ships to npm. */
  serverEntry: string
  /** TUI plugin entry: the built `dist/tui.js` that ships to npm. */
  tuiEntry: string
  /** Environment variable holding the live credential, e.g. `OPENCODE_API_KEY`. */
  credentialEnv: string
  /** Value registered for a `credential: "invalid"` case. */
  invalidCredential?: string
  /** Directory name under `plugins/`; defaults to `statusline`. */
  pluginDir?: string
  /** Tools required on PATH; defaults to `opencode --version` and `tmux -V`. */
  tools?: readonly ToolCheck[]
}

export type CaseContext = {
  spec: CaseSpec
  root: string
  env: Env
  projectDir: string
  sessionID: string
  tmuxSocket: string
  servicePort: number
  artifactBase: string
  capture(): Promise<string>
}

export type Harness = {
  run(cmd: string[], options?: RunOptions): Promise<RunResult>
  /** Read the live credential from the environment; call before any TUI work. */
  requireCredential(): string
  /** Verify the required tools are on PATH and log their versions. */
  assertTools(): Promise<void>
  prepareCase(spec: CaseSpec): Promise<CaseContext>
  sendPrompt(context: CaseContext, text: string, timeoutMs?: number): Promise<void>
  startTui(context: CaseContext): Promise<void>
  waitForFrame(context: CaseContext, pattern: RegExp, timeoutMs?: number): Promise<string>
  writeArtifacts(context: CaseContext, frame: string): Promise<void>
  cleanupCase(context: CaseContext): Promise<void>
}

const DEFAULT_TOOLS: readonly ToolCheck[] = [
  { name: "opencode", args: ["--version"] },
  { name: "tmux", args: ["-V"] },
]

// Keep the test frame small and deterministic: no sidebar, no tab strip.
// Written to the isolated cli.json — OPENCODE_CLI_CONFIG_CONTENT reaches the
// TUI process but its settings do not take effect on opencode > 2.0.0.
const CLI_CONFIG = {
  $schema: "https://opencode.ai/v2/cli.json",
  session: { sidebar: "hide" },
  tabs: { enabled: false },
}

export function createHarness(config: HarnessConfig): Harness {
  const serverEntry = resolve(config.serverEntry)
  const tuiEntry = resolve(config.tuiEntry)
  const packageRoot = resolve(config.packageRoot)
  const artifactDir = process.env.E2E_ARTIFACT_DIR ?? join(packageRoot, "test", "e2e", ".artifacts")
  const rootBase = process.env.E2E_ROOT_BASE ?? "/tmp"
  const keepRoot = process.env.E2E_KEEP === "1"
  const pluginDir = config.pluginDir ?? "statusline"
  const invalidCredential = config.invalidCredential ?? "invalid-e2e-credential"
  const tools = config.tools ?? DEFAULT_TOOLS

  function requireCredential(): string {
    const key = process.env[config.credentialEnv]?.trim()
    if (!key) {
      throw new Error(
        `${config.credentialEnv} is required for the integration tests (see AGENTS.md). ` +
          `Example: ${config.credentialEnv}=sk-... bun run test`,
      )
    }
    return key
  }

  async function assertTools(): Promise<void> {
    for (const tool of tools) {
      const check = await checkTool(tool.name, tool.args)
      if (!check.ok) {
        throw new Error(`${tool.name} is required for the integration tests: ${check.error ?? "not found"}`)
      }
      console.log(check.version)
    }
  }

  async function prepareCase(spec: CaseSpec): Promise<CaseContext> {
    for (const entry of [serverEntry, tuiEntry]) {
      if (!(await Bun.file(entry).exists())) {
        throw new Error(`${entry} is missing — run \`bun run build\` before the integration tests`)
      }
    }

    const credential = spec.credential === "invalid" ? invalidCredential : requireCredential()

    const root = await shortRoot(rootBase, spec.name)
    const env = isolate(root)
    for (const dir of ["home", `config/opencode/plugins/${pluginDir}`, "data/opencode", "state", "cache"]) {
      await mkdir(join(root, dir), { recursive: true })
    }

    // Load the package's built entries as a globally-scoped plugin (see file header).
    await writeFile(
      join(root, `config/opencode/plugins/${pluginDir}/index.ts`),
      `export { default } from "file://${serverEntry}"\n`,
    )
    await writeFile(
      join(root, `config/opencode/plugins/${pluginDir}/tui.tsx`),
      `export { default } from "file://${tuiEntry}"\n`,
    )
    await writeFile(join(root, "config/opencode/cli.json"), JSON.stringify(CLI_CONFIG, null, 2) + "\n")

    const servicePort = freePort()
    await mustRun([OPENCODE, "service", "set", "port", String(servicePort)], { env })
    await mustRun([OPENCODE, "service", "set", "env", config.credentialEnv, credential], { env })

    const projectDir = join(root, "p")
    await mkdir(projectDir, { recursive: true })
    await writeFile(
      join(projectDir, "opencode.json"),
      JSON.stringify(
        {
          $schema: "https://opencode.ai/config.json",
          model: `${spec.model.providerID}/${spec.model.id}`,
          ...(spec.providers ? { providers: spec.providers } : {}),
        },
        null,
        2,
      ) + "\n",
    )

    const created = await mustRun(
      [
        OPENCODE,
        "api",
        "post",
        "/api/session",
        "-d",
        JSON.stringify({ model: spec.model, location: { directory: projectDir } }),
      ],
      { env, cwd: projectDir, timeoutMs: 60_000 },
    )
    const sessionID = parseJson<{ data?: { id?: string } }>(created.stdout, "session.create").data?.id
    if (!sessionID) throw new Error(`session.create returned no id:\n${created.stdout}`)

    const tmuxSocket = `ocstat-${spec.name}-${process.pid}`
    return {
      spec,
      root,
      env,
      projectDir,
      sessionID,
      tmuxSocket,
      servicePort,
      artifactBase: join(artifactDir, spec.name),
      capture: async () => {
        const result = await run(["tmux", "-L", tmuxSocket, "-f", "/dev/null", "capture-pane", "-p", "-t", "t"], {
          env,
        })
        return result.stdout
      },
    }
  }

  async function sendPrompt(context: CaseContext, text: string, timeoutMs = 120_000): Promise<void> {
    await mustRun(
      [
        OPENCODE,
        "api",
        "post",
        `/api/session/${context.sessionID}/prompt`,
        "-d",
        JSON.stringify({ text }),
      ],
      { env: context.env, cwd: context.projectDir, timeoutMs: 30_000 },
    )

    const deadline = Date.now() + timeoutMs
    let last = ""
    while (Date.now() < deadline) {
      const result = await run([OPENCODE, "api", "get", `/api/session/${context.sessionID}`], {
        env: context.env,
        cwd: context.projectDir,
        timeoutMs: 30_000,
      })
      const outcome = parseJson<{ data?: { outcome?: string } }>(result.stdout, "session.get").data?.outcome
      if (outcome === "succeeded") return
      if (outcome === "failed") throw new Error(`model request failed (session ${context.sessionID})`)
      last = result.stdout
      await Bun.sleep(2_000)
    }
    throw new Error(`model request did not finish within ${timeoutMs}ms; last session state:\n${last}`)
  }

  async function startTui(context: CaseContext): Promise<void> {
    const { spec } = context
    const tuiEnv: Env = {
      ...context.env,
      ...(spec.language === "zh-CN" ? { LANG: "zh_CN.UTF-8", LC_ALL: "zh_CN.UTF-8" } : {}),
    }
    await mustRun(
      [
        "tmux",
        "-L",
        context.tmuxSocket,
        "-f",
        "/dev/null",
        "new-session",
        "-d",
        "-s",
        "t",
        "-x",
        String(spec.width),
        "-y",
        String(spec.height),
        "-c",
        context.projectDir,
        `${OPENCODE} --session ${context.sessionID}`,
      ],
      { env: tuiEnv, timeoutMs: 30_000 },
    )
  }

  /** Poll the pane until `pattern` matches, then settle and return the final frame. */
  async function waitForFrame(context: CaseContext, pattern: RegExp, timeoutMs = 90_000): Promise<string> {
    const deadline = Date.now() + timeoutMs
    let frame = ""
    while (Date.now() < deadline) {
      frame = await context.capture()
      if (frame && pattern.test(frame)) break
      await Bun.sleep(2_000)
    }
    await Bun.sleep((context.spec.settleSeconds ?? 3) * 1_000)
    return await context.capture()
  }

  async function writeArtifacts(context: CaseContext, frame: string): Promise<void> {
    await mkdir(artifactDir, { recursive: true })
    await writeFile(`${context.artifactBase}.txt`, frame)
  }

  async function cleanupCase(context: CaseContext): Promise<void> {
    await run(["tmux", "-L", context.tmuxSocket, "kill-server"], { env: context.env })
    await run([OPENCODE, "service", "stop"], { env: context.env, timeoutMs: 30_000 })
    if (!keepRoot) await rm(context.root, { recursive: true, force: true })
  }

  return {
    run,
    requireCredential,
    assertTools,
    prepareCase,
    sendPrompt,
    startTui,
    waitForFrame,
    writeArtifacts,
    cleanupCase,
  }
}

export async function run(
  cmd: string[],
  options: { env?: Env; cwd?: string; timeoutMs?: number } = {},
): Promise<RunResult> {
  const proc = Bun.spawn(cmd, {
    env: { ...process.env, ...options.env },
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

async function mustRun(cmd: string[], options: { env?: Env; cwd?: string; timeoutMs?: number }): Promise<RunResult> {
  const result = await run(cmd, options)
  if (result.code !== 0) {
    throw new Error(`${cmd.join(" ")} exited with ${result.code}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
  }
  return result
}

function freePort(): number {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("") })
  const port = server.port
  void server.stop(true)
  if (port === undefined) throw new Error("could not allocate a free TCP port")
  return port
}

/** Short-lived root under /tmp so the footer directory indicator stays short. */
async function shortRoot(base: string, name: string): Promise<string> {
  const slug = name.replace(/[^a-z0-9]+/gi, "").toLowerCase().slice(0, 12) || "case"
  const suffix = Math.random().toString(36).slice(2, 8)
  const root = join(base, `ocs-${slug}-${suffix}`)
  await mkdir(root, { recursive: true })
  return root
}

function isolate(root: string, extra: Env = {}): Env {
  return {
    HOME: join(root, "home"),
    XDG_CONFIG_HOME: join(root, "config"),
    XDG_DATA_HOME: join(root, "data"),
    XDG_STATE_HOME: join(root, "state"),
    XDG_CACHE_HOME: join(root, "cache"),
    ...extra,
  }
}

async function checkTool(name: string, args: string[]): Promise<{ ok: boolean; version: string; error?: string }> {
  try {
    const result = await run([name, ...args], { timeoutMs: 30_000 })
    const version = result.stdout.trim().split("\n")[0] ?? ""
    if (result.code === 0 && version) return { ok: true, version }
    return { ok: false, version, error: result.stderr.trim() || `exit ${result.code}` }
  } catch (error) {
    return { ok: false, version: "", error: String(error) }
  }
}

function parseJson<T>(text: string, what: string): T {
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`${what} did not return JSON:\n${text}`)
  }
}
