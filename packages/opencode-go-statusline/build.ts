// Build the TUI entry with the same Solid transform OpenCode applies to
// local .tsx plugins at runtime.
//
// Why this is required: OpenCode only runs the Solid JSX transform
// (babel-preset-solid, `generate: "universal"`) on plugin files *outside*
// node_modules. A published package is always under node_modules, so its JSX
// must already be compiled with this transform — otherwise the JSX runtime
// receives plain, eagerly-evaluated props (no reactive getters) and the
// statusline paints once and never updates.
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"

const result = await Bun.build({
  entrypoints: ["tui.tsx"],
  outdir: "dist",
  target: "bun",
  format: "esm",
  plugins: [createSolidTransformPlugin({ moduleName: "@opentui/solid" })],
  external: ["@opencode/plugin", "@opencode/plugin/*", "@opentui/*", "solid-js", "solid-js/*"],
})

if (!result.success) {
  for (const log of result.logs) console.error(log)
  process.exit(1)
}

for (const output of result.outputs) console.log(`built ${output.path}`)
