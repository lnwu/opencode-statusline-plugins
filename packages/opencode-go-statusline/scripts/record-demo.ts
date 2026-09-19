#!/usr/bin/env bun
// Record the README demo(s) for `opencode-go-statusline` via the shared core
// recorder (`core/src/record-demo.ts`): a real TUI in a fixed-size tmux pane,
// wrapped in `terminal-svg rec`, driven with tmux send-keys, then rendered to
// an animated SVG (plus the asciicast master). Two takes, one per locale,
// because the footer labels are bilingual (`5h / Weekly / Monthly` vs
// `5h / 周 / 月`) — the only difference between them is the pane's `LANG` and
// the prompt.
//
// Uses the developer's own OpenCode configuration and credentials, in a
// throw-away project directory (default `~/oc-demo`, deleted before and after
// each take); the throw-away sessions are deleted too. Records whatever
// plugins the local configuration loads.
//
// Defaults can live in `<package>/record-demo.config.json` (gitignored, e.g.
// `{ "model": "opencode-go/deepseek-v4.1-flash" }`); CLI flags override it.
//
// Requirements: `opencode`, `tmux`, and `terminal-svg`
// (`brew install russmckendrick/tap/terminal-svg`) on PATH, and a logged-in
// OpenCode Go credential.
//
// Usage:
//   bun scripts/record-demo.ts                 # en and zh-CN
//   bun scripts/record-demo.ts --locale en
//   bun scripts/record-demo.ts --prompt "Reply with: ok"
//   bun scripts/record-demo.ts --cursor block  # render the TUI cursor
//
// Outputs (repo-only, never in the npm tarball):
//   assets/demo.en.svg / assets/demo.zh-CN.svg          animated README images
//   assets/demo.en.cast / assets/demo.zh-CN.cast        asciicast masters
import { resolve } from "node:path";
import { assertRecordingTools, loadDemoConfig, recordDemo } from "core/record-demo";
import { parseRecordDemoArgs, type RecordDemoCli } from "core/record-demo-cli";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

// The terminal locale drives the statusline labels (`5h / Weekly / Monthly`
// vs `5h / 周 / 月`).
const CLI: RecordDemoCli = {
  defaultModel: { providerID: "opencode-go", id: "deepseek-v4.1-flash" },
  takes: [
    { name: "en", outputBasename: "demo.en", prompt: "Reply with exactly: ok" },
    {
      name: "zh-CN",
      outputBasename: "demo.zh-CN",
      prompt: "请只回复：ok",
      env: { LANG: "zh_CN.UTF-8", LC_ALL: "zh_CN.UTF-8" },
    },
  ],
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
