#!/usr/bin/env bun
// Record the README demo for `opencode-go-statusline`: the real TUI in a
// fixed-size tmux pane, wrapped in `terminal-svg rec`, driven with tmux
// send-keys, then rendered to an animated SVG (plus the asciicast master).
//
// The take opens on opencode's home screen (logo + composer), types the
// prompt, waits for the reply to finish, then quits; the cast is rendered
// starting at the TUI's first paint so the animation does not open on the
// blank/collapsing terminal.
//
// Two modes:
//
// - Local (default): uses the developer's own OpenCode configuration and
//   credentials, in a throw-away project directory (default `~/oc-demo`,
//   deleted before and after the take); the throw-away sessions are deleted
//   too. Records whatever plugins the local configuration loads.
// - `--isolated`: clean-room take from `OPENCODE_API_KEY` (the e2e harness
//   recipe: isolated HOME/XDG root, own service port, sidebar hidden). Needed
//   when the working tree's built `dist/` entries must be what gets recorded,
//   e.g. in CI.
//
// Requirements: `opencode`, `tmux`, and `terminal-svg`
// (`brew install russmckendrick/tap/terminal-svg`) on PATH; `--isolated` also
// needs `OPENCODE_API_KEY` and the built `dist/` entries (`record:demo` runs
// the build first).
//
// Usage:
//   bun scripts/record-demo.ts                        # local, en and zh-CN
//   bun scripts/record-demo.ts --locale en
//   bun scripts/record-demo.ts --prompt "Reply with: ok"
//   bun scripts/record-demo.ts --isolated --locale en # clean-room take
//
// Outputs (repo-only, never in the npm tarball):
//   assets/demo.en.svg / assets/demo.zh-CN.svg          animated README images
//   assets/demo.en.cast / assets/demo.zh-CN.cast        asciicast masters
import { mkdir, realpath, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { createHarness, run, type Env } from "core/harness"

const PACKAGE_ROOT = resolve(import.meta.dir, "..")
const ASSETS_DIR = join(PACKAGE_ROOT, "assets")
const MODEL = { providerID: "opencode-go", id: "deepseek-v4.1-flash" }

const COLS = 120
const ROWS = 28
const SESSION = "demo"
const TYPE_DELAY_MS = 50
/** Hold the home screen briefly before typing so the logo is readable. */
const HOME_SCREEN_PAUSE_MS = 700
const IDLE_TIME_LIMIT = 1.2
const SPEED = 1.25
const REPLY_TIMEOUT_MS = 180_000
const LOCAL_DIR = join(homedir(), "oc-demo")
/** How `LOCAL_DIR` is shown in help text. */
const LOCAL_DIR_DISPLAY = "~/oc-demo"
/** Window title shown in the SVG chrome (the cast header stores the command). */
const WINDOW_TITLE = "opencode"
/** Home-screen footer hint; present once the TUI is ready for input. */
const READY_MARKER = "ctrl+p"
/** Assistant metadata line; present once a turn has finished. */
const DONE_MARKER = "tok/s"

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
  replyTimeoutMs: number
  isolated: boolean
  dir: string
}

/** One prepared recording environment; `cleanup` is always called. */
type Take = {
  env: Env
  projectDir: string
  tmuxSocket: string
  cleanup(): Promise<void>
}

function usage(): string {
  return [
    "usage: bun scripts/record-demo.ts [options]",
    "",
    "  --locale en|zh-CN|all   Which demo(s) to record (default: all)",
    '  --prompt <text>         Prompt to type; overrides the per-locale default',
    `                          (en: "${DEFAULT_PROMPTS.en}", zh-CN: "${DEFAULT_PROMPTS["zh-CN"]}")`,
    "  --theme <name>          terminal-svg theme (default: github-dark)",
    "  --from <seconds>        Start the animation here instead of the first paint",
    "  --reply-timeout <ms>    How long to wait for a finished turn (default: 180000)",
    "  --isolated              Record the working tree in a clean-room environment",
    "                          from OPENCODE_API_KEY instead of the local config",
    `  --dir <path>            Local throw-away project directory (default: ${LOCAL_DIR_DISPLAY})`,
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
    replyTimeoutMs: REPLY_TIMEOUT_MS,
    isolated: false,
    dir: LOCAL_DIR,
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
      case "--isolated":
        options.isolated = true
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

/** Quote a string for a `/bin/sh` command line. */
function shq(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

const harness = createHarness({
  packageRoot: PACKAGE_ROOT,
  serverEntry: join(PACKAGE_ROOT, "dist", "index.js"),
  tuiEntry: join(PACKAGE_ROOT, "dist", "tui.js"),
  credentialEnv: "OPENCODE_API_KEY",
})

/** Clean-room take: isolated root, credential and plugins from the env. */
async function prepareIsolated(locale: Locale, options: Options): Promise<Take> {
  const context = await harness.prepareCase({
    name: `demo-${locale}`,
    width: COLS,
    height: ROWS,
    language: locale,
    model: MODEL,
    expect: [],
  })
  return {
    env: context.env,
    projectDir: context.projectDir,
    tmuxSocket: context.tmuxSocket,
    cleanup: () => harness.cleanupCase(context),
  }
}

/** Local take: the developer's own config, in a throw-away project directory. */
async function prepareLocal(options: Options): Promise<Take> {
  const projectDir = resolve(options.dir)
  await rm(projectDir, { recursive: true, force: true })
  await mkdir(projectDir, { recursive: true })
  // opencode stores the canonical directory in a session, so match on it
  // (e.g. `--dir /tmp/x` is `/private/tmp/x` on macOS).
  const canonicalDir = await realpath(projectDir)
  await writeFile(
    join(projectDir, "opencode.json"),
    JSON.stringify({ $schema: "https://opencode.ai/config.json", model: `${MODEL.providerID}/${MODEL.id}` }, null, 2) +
      "\n",
  )
  const tmuxSocket = `oc-demo-${process.pid}`
  return {
    env: {},
    projectDir,
    tmuxSocket,
    cleanup: async () => {
      await run(["tmux", "-L", tmuxSocket, "kill-server"])
      await deleteSessionsFor(canonicalDir)
      await rm(projectDir, { recursive: true, force: true })
    },
  }
}

/** Best effort: delete every session whose directory is the throw-away dir. */
async function deleteSessionsFor(directory: string, env: Env = {}): Promise<void> {
  const listed = await run(["opencode", "api", "get", "/api/session"], { env, timeoutMs: 30_000 })
  if (listed.code !== 0) return
  let sessions: Array<{ id?: string; location?: { directory?: string } }>
  try {
    sessions = (JSON.parse(listed.stdout) as { data?: typeof sessions }).data ?? []
  } catch {
    return
  }
  for (const session of sessions) {
    if (session.id && session.location?.directory === directory) {
      await run(["opencode", "api", "delete", `/api/session/${session.id}`], { env, timeoutMs: 30_000 })
    }
  }
}

async function recordLocale(locale: Locale, options: Options): Promise<void> {
  console.log(`\n=== ${locale} (${options.isolated ? "isolated" : "local"}) ===`)
  const take = options.isolated ? await prepareIsolated(locale, options) : await prepareLocal(options)
  const svgPath = join(ASSETS_DIR, `demo.${locale}.svg`)
  const castPath = join(ASSETS_DIR, `demo.${locale}.cast`)
  const rawSvgPath = join(take.projectDir, "recording.svg")
  const paneScript = join(take.projectDir, "record.sh")

  // The terminal locale drives the statusline labels (`5h / Weekly / Monthly`
  // vs `5h / 周 / 月`); in isolated mode the harness's `language` only affects
  // its own TUI runs, so set it here either way.
  const paneEnv: Env =
    locale === "zh-CN" ? { ...take.env, LANG: "zh_CN.UTF-8", LC_ALL: "zh_CN.UTF-8" } : take.env

  const tmux = (...args: string[]) =>
    run(["tmux", "-L", take.tmuxSocket, "-f", "/dev/null", ...args], { env: paneEnv })
  const mustTmux = async (...args: string[]) => {
    const result = await tmux(...args)
    if (result.code !== 0) throw new Error(`tmux ${args.join(" ")} failed:\n${result.stderr || result.stdout}`)
    return result
  }
  const capture = async () => (await mustTmux("capture-pane", "-p", "-t", SESSION)).stdout
  const waitFor = async (marker: string, timeoutMs: number) => {
    const deadline = Date.now() + timeoutMs
    let frame = ""
    while (Date.now() < deadline) {
      frame = await capture()
      if (frame.includes(marker)) return frame
      await Bun.sleep(1_000)
    }
    throw new Error(`timed out waiting for ${JSON.stringify(marker)}; last frame:\n${frame}`)
  }

  let frame = ""
  try {
    await rm(svgPath, { force: true })
    await rm(castPath, { force: true })

    // Plain `opencode` starts on the home screen (logo + composer); the
    // session is created by the first prompt and deleted in cleanup.
    await writeFile(
      paneScript,
      [
        "#!/usr/bin/env bash",
        `exec ${process.env.TERMINAL_SVG ?? "terminal-svg"} rec -c ${COLS} -r ${ROWS} ` +
          `-o ${shq(rawSvgPath)} --cast ${shq(castPath)} -- opencode`,
        "",
      ].join("\n"),
    )

    await mustTmux(
      "new-session",
      "-d",
      "-s",
      SESSION,
      "-x",
      String(COLS),
      "-y",
      String(ROWS),
      "-c",
      take.projectDir,
      `bash ${shq(paneScript)}`,
    )

    console.log("waiting for the TUI")
    await waitFor(READY_MARKER, 120_000)
    await Bun.sleep(HOME_SCREEN_PAUSE_MS)

    const prompt = options.prompts[locale]
    console.log(`typing: ${prompt}`)
    for (const char of prompt) {
      await mustTmux("send-keys", "-t", SESSION, "-l", char)
      await Bun.sleep(TYPE_DELAY_MS)
    }
    await mustTmux("send-keys", "-t", SESSION, "C-m")

    console.log("waiting for the reply")
    await waitFor(DONE_MARKER, options.replyTimeoutMs)
    await Bun.sleep(1_500)

    // `rec` has no --timeout: quit the TUI and the recorder renders on exit.
    // Escape clears any autocomplete before ctrl+c exits (app_exit keybind).
    await mustTmux("send-keys", "-t", SESSION, "Escape")
    await Bun.sleep(300)
    await mustTmux("send-keys", "-t", SESSION, "C-c")
    for (let i = 0; ; i++) {
      if (i >= 60) throw new Error("the recording session did not exit after ctrl+c")
      if ((await tmux("has-session", "-t", SESSION)).code !== 0) break
      await Bun.sleep(1_000)
    }

    // The cast ends with opencode restoring the primary screen; cut there so
    // the animation holds the finished conversation instead of the exit frame.
    const exitAt = await altScreenExitTime(castPath)
    if (exitAt === undefined) console.warn("no alt-screen exit found; rendering to the end of the cast")
    await retitleCast(castPath, WINDOW_TITLE)

    // Skip the blank terminal (and its collapsing window) before the first
    // paint: open on opencode's home screen.
    const from = options.from ?? (await firstPaintTime(castPath))

    const render = [
      process.env.TERMINAL_SVG ?? "terminal-svg",
      castPath,
      "--theme",
      options.theme,
      "--title",
      WINDOW_TITLE,
      "--idle-time-limit",
      String(IDLE_TIME_LIMIT),
      "--speed",
      String(SPEED),
      "--no-embed-source",
      "-o",
      svgPath,
    ]
    if (from !== undefined) render.push("--from", String(from))
    if (exitAt !== undefined) render.push("--to", String(exitAt))
    const rendered = await run(render)
    if (rendered.code !== 0) throw new Error(`terminal-svg failed:\n${rendered.stderr || rendered.stdout}`)

    console.log(`wrote ${svgPath}\n      ${castPath}`)
  } catch (error) {
    frame = frame || (await capture().catch(() => ""))
    if (frame) console.error(`last frame:\n${frame}`)
    throw error
  } finally {
    await take.cleanup()
  }
}

/** Time of the last `ESC[?1049l` (leaving the alternate screen) in the cast. */
async function altScreenExitTime(castPath: string): Promise<number | undefined> {
  const text = await Bun.file(castPath).text()
  let exitAt: number | undefined
  for (const line of text.split("\n")) {
    const event = parseEvent(line)
    if (!event) continue
    const [time, type, data] = event
    if (type === "o" && typeof data === "string" && data.includes("\u001b[?1049l")) exitAt = time
  }
  return exitAt === undefined ? undefined : Math.max(0, exitAt - 0.01)
}

/**
 * Start of the TUI's first real paint: the first output event that sets an
 * explicit background (the blank terminal before it only uses default
 * colours). A short beat later the home screen is fully drawn.
 */
async function firstPaintTime(castPath: string): Promise<number | undefined> {
  const text = await Bun.file(castPath).text()
  for (const line of text.split("\n")) {
    const event = parseEvent(line)
    if (!event) continue
    const [time, type, data] = event
    if (type === "o" && typeof data === "string" && /\u001b\[(?:48;[25];|4[0-7]m)/.test(data)) {
      return time + 0.3
    }
  }
  return undefined
}

function parseEvent(line: string): [number, string, unknown] | undefined {
  if (!line.trim()) return undefined
  let event: unknown
  try {
    event = JSON.parse(line)
  } catch {
    return undefined
  }
  if (!Array.isArray(event) || typeof event[0] !== "number" || typeof event[1] !== "string") return undefined
  return event as [number, string, unknown]
}

/** Rewrite the cast header title (`rec` stores the command string there). */
async function retitleCast(castPath: string, title: string): Promise<void> {
  const text = await Bun.file(castPath).text()
  const newline = text.indexOf("\n")
  if (newline < 0) return
  const header = JSON.parse(text.slice(0, newline)) as { title?: string }
  header.title = title
  await Bun.write(castPath, JSON.stringify(header) + text.slice(newline))
}

const options = parseOptions(process.argv.slice(2))
if (options.isolated) {
  try {
    harness.requireCredential()
  } catch {
    throw new Error(
      "OPENCODE_API_KEY is required with --isolated (see the `record-demo` skill). " +
        "Drop --isolated to record with the local OpenCode configuration instead.",
    )
  }
}
await mkdir(ASSETS_DIR, { recursive: true })
await harness.assertTools()
const terminalSvg = await run([process.env.TERMINAL_SVG ?? "terminal-svg", "--version"])
if (terminalSvg.code !== 0) {
  throw new Error("terminal-svg is required: brew install russmckendrick/tap/terminal-svg")
}
console.log(terminalSvg.stdout.trim())

for (const locale of options.locales) await recordLocale(locale, options)
