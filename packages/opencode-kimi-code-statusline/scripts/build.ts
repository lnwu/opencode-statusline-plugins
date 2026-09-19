// Build the server, RPC, and TUI entries referenced by package.json via the
// shared core helper (see `core/src/build.ts` for why pre-compiling is
// required and what stays external).
//
// Run from the package root: `bun run build` (bun run scripts/build.ts).
import { buildPlugin } from "core/build"

await buildPlugin()
