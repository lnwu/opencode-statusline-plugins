// Shared README demo recorder: drives a real OpenCode TUI in a fixed-size
// tmux pane, wrapped in `terminal-svg rec`, and renders the finished cast to
// an animated SVG (plus the asciicast master). Package wrappers
// (`opencode-go-statusline/scripts/record-demo.ts`,
// `opencode-copilot-statusline/scripts/record-demo.ts`) configure the takes;
// this module has no notion of locale or footer label text, only "what to
// type, in what environment, into which output file".
//
// Always local: uses the developer's own OpenCode configuration and
// credentials, in a throw-away project directory (default `~/oc-demo`,
// deleted before and after each take); the throw-away session is deleted too.
//
// The take opens on opencode's home screen (logo + composer), types the
// prompt, waits for the reply to finish, then quits; the cast is rendered
// starting at the TUI's first paint so the animation does not open on the
// blank/collapsing terminal.
import { mkdir, realpath, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { run, type Env, type ModelRef } from "./harness"

const COLS = 120
const ROWS = 28
const SESSION = "demo"
const TYPE_DELAY_MS = 50
/** Hold the home screen briefly before typing so the logo is readable. */
const HOME_SCREEN_PAUSE_MS = 700
const IDLE_TIME_LIMIT = 1.2
const SPEED = 1.25
const DEFAULT_REPLY_TIMEOUT_MS = 180_000
const DEFAULT_THEME = "github-dark"
/** Window title shown in the SVG chrome (the cast header stores the command). */
const WINDOW_TITLE = "opencode"
/** Home-screen footer hint; present once the TUI is ready for input. */
const READY_MARKER = "ctrl+p"
/** Assistant metadata line; present once a turn has finished. */
const DONE_MARKER = "tok/s"

/** One recorded take: a prompt, a model, and where the output lands. */
export type DemoTake = {
  /** Distinguishes log output; not used in any file name. */
  name: string
  /** Output basename under `assets/`, without extension, e.g. `demo` or `demo.en`. */
  outputBasename: string
  model: ModelRef
  prompt: string
  /** Extra env for the recorded pane, e.g. `LANG` for locale-specific labels. */
  env?: Env
}

export type RecordDemoOptions = {
  /** Plugin package root; takes are written under `<root>/assets`. */
  packageRoot: string
  takes: DemoTake[]
  theme?: string
  /** Start the animation here instead of the TUI's first paint. */
  from?: number
  replyTimeoutMs?: number
  /** Throw-away project directory; defaults to `~/oc-demo`. */
  dir?: string
}

/** Verify `opencode`, `tmux`, and `terminal-svg` are on PATH; log their versions. */
export async function assertRecordingTools(): Promise<void> {
  for (const tool of [
    { name: "opencode", args: ["--version"] },
    { name: "tmux", args: ["-V"] },
  ]) {
    const result = await run([tool.name, ...tool.args], { timeoutMs: 30_000 })
    if (result.code !== 0) throw new Error(`${tool.name} is required for recording (not found on PATH)`)
    console.log(result.stdout.trim().split("\n")[0])
  }
  const terminalSvg = await run([process.env.TERMINAL_SVG ?? "terminal-svg", "--version"])
  if (terminalSvg.code !== 0) {
    throw new Error("terminal-svg is required: brew install russmckendrick/tap/terminal-svg")
  }
  console.log(terminalSvg.stdout.trim())
}

/** Record every take in sequence, each in its own throw-away project directory. */
export async function recordDemo(options: RecordDemoOptions): Promise<void> {
  const packageRoot = resolve(options.packageRoot)
  const assetsDir = join(packageRoot, "assets")
  const theme = options.theme ?? DEFAULT_THEME
  const replyTimeoutMs = options.replyTimeoutMs ?? DEFAULT_REPLY_TIMEOUT_MS
  const dir = resolve(options.dir ?? join(homedir(), "oc-demo"))

  await mkdir(assetsDir, { recursive: true })
  for (const take of options.takes) {
    console.log(`\n=== ${take.name} ===`)
    await recordTake(take, { assetsDir, theme, from: options.from, replyTimeoutMs, dir })
  }
}

/** Quote a string for a `/bin/sh` command line. */
function shq(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

async function recordTake(
  take: DemoTake,
  ctx: { assetsDir: string; theme: string; from?: number; replyTimeoutMs: number; dir: string },
): Promise<void> {
  const projectDir = ctx.dir
  await rm(projectDir, { recursive: true, force: true })
  await mkdir(projectDir, { recursive: true })
  // opencode stores the canonical directory in a session, so match on it
  // (e.g. `--dir /tmp/x` is `/private/tmp/x` on macOS).
  const canonicalDir = await realpath(projectDir)
  await writeFile(
    join(projectDir, "opencode.json"),
    JSON.stringify(
      { $schema: "https://opencode.ai/config.json", model: `${take.model.providerID}/${take.model.id}` },
      null,
      2,
    ) + "\n",
  )

  const tmuxSocket = `oc-demo-${process.pid}`
  const svgPath = join(ctx.assetsDir, `${take.outputBasename}.svg`)
  const castPath = join(ctx.assetsDir, `${take.outputBasename}.cast`)
  const rawSvgPath = join(projectDir, "recording.svg")
  const paneScript = join(projectDir, "record.sh")
  const paneEnv: Env = take.env ?? {}

  const tmux = (...args: string[]) => run(["tmux", "-L", tmuxSocket, "-f", "/dev/null", ...args], { env: paneEnv })
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
      projectDir,
      `bash ${shq(paneScript)}`,
    )

    console.log("waiting for the TUI")
    await waitFor(READY_MARKER, 120_000)
    await Bun.sleep(HOME_SCREEN_PAUSE_MS)

    console.log(`typing: ${take.prompt}`)
    for (const char of take.prompt) {
      await mustTmux("send-keys", "-t", SESSION, "-l", char)
      await Bun.sleep(TYPE_DELAY_MS)
    }
    await mustTmux("send-keys", "-t", SESSION, "C-m")

    console.log("waiting for the reply")
    await waitFor(DONE_MARKER, ctx.replyTimeoutMs)
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
    const from = ctx.from ?? (await firstPaintTime(castPath))

    const render = [
      process.env.TERMINAL_SVG ?? "terminal-svg",
      castPath,
      "--theme",
      ctx.theme,
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
    await run(["tmux", "-L", tmuxSocket, "kill-server"])
    await deleteSessionsFor(canonicalDir)
    await rm(projectDir, { recursive: true, force: true })
  }
}

/** Best effort: delete every session whose directory is the throw-away dir. */
async function deleteSessionsFor(directory: string): Promise<void> {
  const listed = await run(["opencode", "api", "get", "/api/session"], { timeoutMs: 30_000 })
  if (listed.code !== 0) return
  let sessions: Array<{ id?: string; location?: { directory?: string } }>
  try {
    sessions = (JSON.parse(listed.stdout) as { data?: typeof sessions }).data ?? []
  } catch {
    return
  }
  for (const session of sessions) {
    if (session.id && session.location?.directory === directory) {
      await run(["opencode", "api", "delete", `/api/session/${session.id}`], { timeoutMs: 30_000 })
    }
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
