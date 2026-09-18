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
// Requirements: `opencode`, `tmux`, and `terminal-svg`
// (`brew install russmckendrick/tap/terminal-svg`) on PATH, and a logged-in
// OpenCode Go credential.
//
// Usage:
//   bun scripts/record-demo.ts                 # en and zh-CN
//   bun scripts/record-demo.ts --locale en
//   bun scripts/record-demo.ts --prompt "Reply with: ok"
//
// Outputs (repo-only, never in the npm tarball):
//   assets/demo.en.svg / assets/demo.zh-CN.svg          animated README images
//   assets/demo.en.cast / assets/demo.zh-CN.cast        asciicast masters
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { assertRecordingTools, recordDemo, type DemoTake } from "core/record-demo"

const PACKAGE_ROOT = resolve(import.meta.dir, "..")
const MODEL = { providerID: "opencode-go", id: "deepseek-v4.1-flash" }
const LOCAL_DIR_DISPLAY = "~/oc-demo"

type Locale = "en" | "zh-CN"

const DEFAULT_PROMPTS: Record<Locale, string> = {
  en: "Reply with exactly: ok",
  "zh-CN": "请只回复：ok",
}

type Options = {
  locales: Locale[]
  prompts: Record<Locale, string>
  theme: string
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
    "  --from <seconds>        Start the animation here instead of the first paint",
    "  --reply-timeout <ms>    How long to wait for a finished turn (default: 180000)",
    `  --dir <path>            Throw-away project directory (default: ${LOCAL_DIR_DISPLAY})`,
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

function parseOptions(argv: string[]): Options {
  const options: Options = {
    locales: ["en", "zh-CN"],
    prompts: { ...DEFAULT_PROMPTS },
    theme: "github-dark",
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

const options = parseOptions(process.argv.slice(2))
await assertRecordingTools()

// The terminal locale drives the statusline labels (`5h / Weekly / Monthly`
// vs `5h / 周 / 月`).
const takes: DemoTake[] = options.locales.map((locale) => ({
  name: locale,
  outputBasename: `demo.${locale}`,
  model: MODEL,
  prompt: options.prompts[locale],
  env: locale === "zh-CN" ? { LANG: "zh_CN.UTF-8", LC_ALL: "zh_CN.UTF-8" } : undefined,
}))

await recordDemo({
  packageRoot: PACKAGE_ROOT,
  takes,
  theme: options.theme,
  from: options.from,
  replyTimeoutMs: options.replyTimeoutMs,
  dir: options.dir,
})
