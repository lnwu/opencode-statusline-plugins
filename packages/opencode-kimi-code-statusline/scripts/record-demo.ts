#!/usr/bin/env bun
// Record the README demo(s) for `opencode-kimi-code-statusline` via the shared
// core recorder (`core/src/record-demo.ts`): a real TUI in a fixed-size tmux
// pane, wrapped in `terminal-svg rec`, driven with tmux send-keys, then
// rendered to an animated SVG (plus the asciicast master). Two takes, one per
// locale, because the footer labels are bilingual (`5h / Weekly` vs
// `5h / 周`) — the only difference between them is the pane's `LANG` and the
// prompt.
//
// Uses the developer's own OpenCode configuration and Kimi For Coding
// credential, in a throw-away project directory (default `~/oc-demo`, deleted
// before and after each take); the throw-away sessions are deleted too.
// Records whatever plugins the local configuration loads.
//
// Defaults can live in `<package>/record-demo.config.json` (gitignored, e.g.
// `{ "model": "kimi-code-plan-global/k3" }`); CLI flags override it.
//
// Requirements: `opencode`, `tmux`, and `terminal-svg`
// (`brew install russmckendrick/tap/terminal-svg`) on PATH, and a logged-in
// Kimi For Coding credential (`opencode auth login kimi-code-plan-global`).
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
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import {
  assertRecordingTools,
  loadDemoConfig,
  recordDemo,
  type CursorStyle,
  type DemoConfig,
  type DemoTake,
} from "core/record-demo"
import type { ModelRef } from "core/harness"

const PACKAGE_ROOT = resolve(import.meta.dir, "..")
const DEFAULT_MODEL = { providerID: "kimi-code-plan-global", id: "kimi-for-coding" }
const LOCAL_DIR_DISPLAY = "~/oc-demo"

type Locale = "en" | "zh-CN"

const DEFAULT_PROMPTS: Record<Locale, string> = {
  en: "Reply with exactly: ok",
  "zh-CN": "请只回复：ok",
}

type Options = {
  locales: Locale[]
  prompts: Record<Locale, string>
  model: ModelRef
  theme: string
  tuiTheme?: string
  cursor: CursorStyle
  from?: number
  replyTimeoutMs?: number
  dir?: string
}

function usage(): string {
  return [
    "usage: bun scripts/record-demo.ts [options]",
    "",
    "  --locale en|zh-CN|all   Which demo(s) to record (default: all)",
    "  --prompt <text>         Prompt to type; overrides the per-locale default",
    `                          (en: "${DEFAULT_PROMPTS.en}", zh-CN: "${DEFAULT_PROMPTS["zh-CN"]}")`,
    "  --theme <name>          terminal-svg theme (default: github-dark)",
    "  --tui-theme <name>      OpenCode TUI theme for the recording (inline CLI settings;",
    "                          default: your own theme)",
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
  if (slash < 0) throw new Error(`model must be provider/id, got: ${value}`)
  return { providerID: value.slice(0, slash), id: value.slice(slash + 1) }
}

function parseOptions(config: DemoConfig, argv: string[]): Options {
  const configPrompt = config.prompt
  const prompts: Record<Locale, string> = {
    en: configPrompt ?? DEFAULT_PROMPTS.en,
    "zh-CN": configPrompt ?? DEFAULT_PROMPTS["zh-CN"],
  }
  const options: Options = {
    locales: ["en", "zh-CN"],
    prompts,
    model: config.model ? parseModel(config.model) : DEFAULT_MODEL,
    theme: config.theme ?? "github-dark",
    tuiTheme: config.tuiTheme,
    cursor: config.cursor ?? "none",
    replyTimeoutMs: config.replyTimeout,
    dir: config.dir ? expandHome(config.dir) : undefined,
  }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    switch (flag) {
      case "--locale": {
        const value = need(argv, i, flag)
        if (value === "all") options.locales = ["en", "zh-CN"]
        else if (value === "en" || value === "zh-CN") options.locales = [value]
        else throw new Error(`unknown locale: ${value}`)
        i++
        break
      }
      case "--prompt": {
        const value = need(argv, i, flag)
        options.prompts = { en: value, "zh-CN": value }
        i++
        break
      }
      case "--theme":
        options.theme = need(argv, i, flag)
        i++
        break
      case "--tui-theme":
        options.tuiTheme = need(argv, i, flag)
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

// The terminal locale drives the statusline labels (`5h / Weekly` vs `5h / 周`).
const takes: DemoTake[] = options.locales.map((locale) => ({
  name: locale,
  outputBasename: `demo.${locale}`,
  model: options.model,
  prompt: options.prompts[locale],
  env: locale === "zh-CN" ? { LANG: "zh_CN.UTF-8", LC_ALL: "zh_CN.UTF-8" } : undefined,
}))

await recordDemo({
  packageRoot: PACKAGE_ROOT,
  takes,
  theme: options.theme,
  tuiTheme: options.tuiTheme,
  cursor: options.cursor,
  from: options.from,
  replyTimeoutMs: options.replyTimeoutMs,
  dir: options.dir,
})
