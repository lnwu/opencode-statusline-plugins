// Build a plugin package's entries with the same Solid transform OpenCode
// applies to local .tsx plugins at runtime.
//
// Why this is required: OpenCode only runs the Solid JSX transform
// (babel-preset-solid, `generate: "universal"`) on plugin files *outside*
// node_modules. A published package is always under node_modules, so its JSX
// must already be compiled with this transform — otherwise the JSX runtime
// receives plain, eagerly-evaluated props (no reactive getters) and the
// statusline paints once and never updates.
//
// The server and RPC entries are bundled too, so plugin sources may import
// this package freely: `core` is a dev-only dependency and is inlined into
// every entry. Runtime imports stay bare so OpenCode rewrites them to its own
// instances at load time.
//
// Run from the package root: `bun run build` (bun run scripts/build.ts).
// Entry points resolve relative to the working directory.
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"

const DEFAULT_ENTRYPOINTS = ["src/index.ts", "src/rpc.ts", "src/tui.tsx"]
const EXTERNAL = ["@opencode/plugin", "@opencode/plugin/*", "@opentui/*", "solid-js", "solid-js/*"]

export async function buildPlugin(options: { entrypoints?: string[]; outdir?: string } = {}): Promise<void> {
  const result = await Bun.build({
    entrypoints: options.entrypoints ?? DEFAULT_ENTRYPOINTS,
    outdir: options.outdir ?? "dist",
    target: "bun",
    format: "esm",
    plugins: [createSolidTransformPlugin({ moduleName: "@opentui/solid" })],
    external: EXTERNAL,
  })

  if (!result.success) {
    for (const log of result.logs) console.error(log)
    process.exit(1)
  }

  for (const output of result.outputs) console.log(`built ${output.path}`)
}
