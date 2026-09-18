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
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import {
  assertRecordingTools,
  loadDemoConfig,
  recordDemo,
  type CursorStyle,
  type DemoConfig,
} from "core/record-demo"
import type { ModelRef } from "core/harness"

const PACKAGE_ROOT = resolve(import.meta.dir, "..")
const DEFAULT_MODEL: ModelRef = { providerID: "github-copilot", id: "gpt-5-mini" }
const DEFAULT_PROMPT = "Reply with exactly: ok"
const LOCAL_DIR_DISPLAY = "~/oc-demo"

type Options = {
  prompt: string
  model: ModelRef
  theme: string
  cursor: CursorStyle
  from?: number
  replyTimeoutMs?: number
  dir?: string
}

function usage(): string {
  return [
    "usage: bun scripts/record-demo.ts [options]",
    "",
    "  --prompt <text>         Prompt to type (default: \"Reply with exactly: ok\")",
    "  --model <provider/id>   Model to record with (default: github-copilot/gpt-5-mini)",
    "  --theme <name>          terminal-svg theme (default: github-dark)",
    "  --cursor <style>        Cursor shape in the SVG: block|bar|underline|none",
    "                          (default: none)",
    "  --from <seconds>        Start the animation here instead of the first paint",
    "  --reply-timeout <ms>    How long to wait for a finished turn (default: 180000)",
    `  --dir <path>            Throw-away project directory (default: ${LOCAL_DIR_DISPLAY})`,
    "",
    `Defaults can be set in ${join(PACKAGE_ROOT, "record-demo.config.json")}`,
    "(gitignored); CLI flags override it.",
  ].join("\n")
}

/** Expand a leading `~` so `--dir ~/demo` works from any shell. */
function expandHome(value: string): string {
  if (value === "~") return homedir()
  if (value.startsWith("~/")) return join(homedir(), value.slice(2))
  return value
}

function need(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1]
  if (!value) throw new Error(`${flag} needs a value`)
  return value
}

function parseModel(value: string): ModelRef {
  const slash = value.indexOf("/")
  if (slash < 0) throw new Error(`--model must be provider/id, got: ${value}`)
  return { providerID: value.slice(0, slash), id: value.slice(slash + 1) }
}

function parseOptions(config: DemoConfig, argv: string[]): Options {
  const options: Options = {
    prompt: config.prompt ?? DEFAULT_PROMPT,
    model: config.model ? parseModel(config.model) : DEFAULT_MODEL,
    theme: config.theme ?? "github-dark",
    cursor: config.cursor ?? "none",
    replyTimeoutMs: config.replyTimeout,
    dir: config.dir ? expandHome(config.dir) : undefined,
  }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    switch (flag) {
      case "--prompt":
        options.prompt = need(argv, i, flag)
        i++
        break
      case "--model":
        options.model = parseModel(need(argv, i, flag))
        i++
        break
      case "--theme":
        options.theme = need(argv, i, flag)
        i++
        break
      case "--cursor": {
        const value = need(argv, i, flag)
        if (value !== "block" && value !== "bar" && value !== "underline" && value !== "none") {
          throw new Error(`unknown cursor style: ${value}`)
        }
        options.cursor = value
        i++
        break
      }
      case "--from":
        options.from = Number(need(argv, i, flag))
        i++
        break
      case "--reply-timeout":
        options.replyTimeoutMs = Number(need(argv, i, flag))
        i++
        break
      case "--dir":
        options.dir = expandHome(need(argv, i, flag))
        i++
        break
      case "--help":
      case "-h":
        console.log(usage())
        process.exit(0)
      default:
        throw new Error(`unknown option: ${flag}\n\n${usage()}`)
    }
  }
  return options
}

const config = await loadDemoConfig(PACKAGE_ROOT)
const options = parseOptions(config, process.argv.slice(2))
await assertRecordingTools()

await recordDemo({
  packageRoot: PACKAGE_ROOT,
  takes: [{ name: "demo", outputBasename: "demo", model: options.model, prompt: options.prompt }],
  theme: options.theme,
  cursor: options.cursor,
  from: options.from,
  replyTimeoutMs: options.replyTimeoutMs,
  dir: options.dir,
})
