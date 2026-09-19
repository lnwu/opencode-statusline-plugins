#!/usr/bin/env bun
// Record the README demo for `opencode-copilot-statusline` via the shared
// core recorder (`core/src/record-demo.ts`): a real TUI in a fixed-size tmux
// pane, wrapped in `terminal-svg rec`, driven with tmux send-keys, then
// rendered to an animated SVG (plus the asciicast master). The statusline has
// no localizable text, so there is a single take (no `demo.<locale>` split).
//
// Uses the developer's own OpenCode configuration and Copilot credential, in
// a throw-away project directory (default `~/oc-demo`, deleted before and
// after the take); the throw-away session is deleted too.
//
// Defaults can live in `<package>/record-demo.config.json` (gitignored, e.g.
// `{ "model": "github-copilot/claude-sonnet-5" }`); CLI flags override it.
//
// Requirements: `opencode`, `tmux`, and `terminal-svg`
// (`brew install russmckendrick/tap/terminal-svg`) on PATH, and a GitHub
// Copilot credential connected to OpenCode
// (`opencode auth login github-copilot`) whose plan supports the recorded
// model — override `--model` if the default is rejected (e.g. Copilot Free
// is entitled to `github-copilot/gpt-4o-mini-2024-07-18` only).
//
// Usage:
//   bun scripts/record-demo.ts
//   bun scripts/record-demo.ts --prompt "Reply with: ok"
//   bun scripts/record-demo.ts --model github-copilot/gpt-4o-mini-2024-07-18
//   bun scripts/record-demo.ts --cursor block  # render the TUI cursor
//
// Outputs (repo-only, never in the npm tarball):
//   assets/demo.svg    animated README image
//   assets/demo.cast   asciicast master
import { resolve } from "node:path";
import { assertRecordingTools, loadDemoConfig, recordDemo } from "core/record-demo";
import { parseRecordDemoArgs, type RecordDemoCli } from "core/record-demo-cli";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

const CLI: RecordDemoCli = {
  defaultModel: { providerID: "github-copilot", id: "gpt-5-mini" },
  takes: [{ name: "demo", outputBasename: "demo", prompt: "Reply with exactly: ok" }],
};

const config = await loadDemoConfig(PACKAGE_ROOT);
const options = parseRecordDemoArgs({
  cli: CLI,
  config,
  argv: process.argv.slice(2),
  packageRoot: PACKAGE_ROOT,
});
await assertRecordingTools();

await recordDemo({ packageRoot: PACKAGE_ROOT, ...options });
