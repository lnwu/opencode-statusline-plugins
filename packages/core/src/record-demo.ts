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
// blank/collapsing terminal. The cursor is hidden by default (`cursor:
// "block"` to render it) so the README image stays clean.
//
// The home screen's model (and therefore which statusline renders) follows
// the globally most-recent model in opencode's `model.json`, not the project
// config, so each take temporarily pins its model there and restores the
// original file when done. Before the first take, each unique take model is
// verified against the local `/api/model` catalog: when the pinned entry
// names a provider/model the instance does not have, opencode silently falls
// back to the next recent model, and the check fails loudly instead. A take
// can likewise pin the TUI theme (`tuiTheme`): CLI settings like
// `theme.name` have no project-local file, so the recorder hands the theme
// to the recorded TUI as inline CLI settings
// (`OPENCODE_CLI_CONFIG_CONTENT`) in the throw-away pane; the developer's own
// global `cli.json` is never touched.
//
// Casts are repaired after recording: terminal-svg's PTY reader decodes each
// 1024-byte read as UTF-8 independently, corrupting a multi-byte glyph that
// straddles the boundary into `U+FFFD` (visible as a stray replacement glyph
// in the logo). `repairCast` restores the glyph and drops the stray byte. The
// rendered SVG is sealed against scaling seams: `sealTiledRects` adds
// `shape-rendering="crispEdges"` to the tiled background rects, whose shared
// edges would otherwise expose the window background as a hairline seam at
// fractional display scales (terminal-svg#3).
import { mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { run, type Env, type ModelRef } from "./harness";

const COLS = 120;
const ROWS = 28;
const SESSION = "demo";
const TYPE_DELAY_MS = 50;
/** Hold the home screen briefly before typing so the logo is readable. */
const HOME_SCREEN_PAUSE_MS = 700;
const IDLE_TIME_LIMIT = 1.2;
const SPEED = 1.25;
const DEFAULT_REPLY_TIMEOUT_MS = 180_000;
const DEFAULT_THEME = "github-dark";
/** Default cursor style: no cursor keeps the README image clean. */
const DEFAULT_CURSOR: CursorStyle = "none";
/** Window title shown in the SVG chrome (the cast header stores the command). */
const WINDOW_TITLE = "opencode";
/** Home-screen footer hint; present once the TUI is ready for input. */
const READY_MARKER = "ctrl+p";
/** Assistant metadata line; present once a turn has finished. */
const DONE_MARKER = "tok/s";

export type CursorStyle = "block" | "bar" | "underline" | "none";

/** One recorded take: a prompt, a model, and where the output lands. */
export type DemoTake = {
  /** Distinguishes log output; not used in any file name. */
  name: string;
  /** Output basename under `assets/`, without extension, e.g. `demo` or `demo.en`. */
  outputBasename: string;
  model: ModelRef;
  prompt: string;
  /** Extra env for the recorded pane, e.g. `LANG` for locale-specific labels. */
  env?: Env;
};

/** Per-package defaults for `record-demo.config.json`; all fields optional. */
export type DemoConfig = {
  /** Model to record with, as `provider/id` (e.g. `github-copilot/gpt-5-mini`). */
  model?: string;
  /** Prompt to type; overrides the wrapper's default for every take. */
  prompt?: string;
  cursor?: CursorStyle;
  theme?: string;
  /** OpenCode TUI theme handed to the recorded TUI as inline CLI settings (e.g. "aura"); defaults to the developer's own theme. */
  tuiTheme?: string;
  /** How long to wait for a finished turn, in ms. */
  replyTimeout?: number;
  /** Throw-away project directory; defaults to `~/oc-demo`. */
  dir?: string;
};

export const CONFIG_FILENAME = "record-demo.config.json";

/**
 * Load `<packageRoot>/record-demo.config.json` when present (the file is
 * gitignored, so every developer can point the recorder at their own model and
 * credentials). Invalid values throw rather than silently recording the wrong
 * thing; CLI flags override the file.
 */
export async function loadDemoConfig(packageRoot: string): Promise<DemoConfig> {
  const path = join(packageRoot, CONFIG_FILENAME);
  const file = Bun.file(path);
  if (!(await file.exists())) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error instanceof Error ? error.message : error}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${path} must be a JSON object`);
  }
  const raw = parsed as Record<string, unknown>;
  const config: DemoConfig = {};
  if (raw.model !== undefined) {
    if (typeof raw.model !== "string" || !raw.model.includes("/")) {
      throw new Error(`${path}: "model" must be "provider/id", got ${JSON.stringify(raw.model)}`);
    }
    config.model = raw.model;
  }
  if (raw.prompt !== undefined) {
    if (typeof raw.prompt !== "string" || raw.prompt === "")
      throw new Error(`${path}: "prompt" must be a non-empty string`);
    config.prompt = raw.prompt;
  }
  if (raw.cursor !== undefined) {
    if (
      raw.cursor !== "block" &&
      raw.cursor !== "bar" &&
      raw.cursor !== "underline" &&
      raw.cursor !== "none"
    ) {
      throw new Error(
        `${path}: "cursor" must be block|bar|underline|none, got ${JSON.stringify(raw.cursor)}`,
      );
    }
    config.cursor = raw.cursor;
  }
  if (raw.theme !== undefined) {
    if (typeof raw.theme !== "string" || raw.theme === "")
      throw new Error(`${path}: "theme" must be a non-empty string`);
    config.theme = raw.theme;
  }
  if (raw.tuiTheme !== undefined) {
    if (typeof raw.tuiTheme !== "string" || raw.tuiTheme === "")
      throw new Error(`${path}: "tuiTheme" must be a non-empty string`);
    config.tuiTheme = raw.tuiTheme;
  }
  if (raw.replyTimeout !== undefined) {
    if (
      typeof raw.replyTimeout !== "number" ||
      !Number.isFinite(raw.replyTimeout) ||
      raw.replyTimeout <= 0
    ) {
      throw new Error(`${path}: "replyTimeout" must be a positive number of milliseconds`);
    }
    config.replyTimeout = raw.replyTimeout;
  }
  if (raw.dir !== undefined) {
    if (typeof raw.dir !== "string" || raw.dir === "")
      throw new Error(`${path}: "dir" must be a non-empty string`);
    config.dir = raw.dir;
  }
  return config;
}

export type RecordDemoOptions = {
  /** Plugin package root; takes are written under `<root>/assets`. */
  packageRoot: string;
  takes: DemoTake[];
  theme?: string;
  /** OpenCode TUI theme for the recording, passed as inline CLI settings; defaults to the developer's own theme. */
  tuiTheme?: string;
  /** Cursor shape in the rendered SVG; defaults to `none` for a clean README image. */
  cursor?: CursorStyle;
  /** Start the animation here instead of the TUI's first paint. */
  from?: number;
  replyTimeoutMs?: number;
  /** Throw-away project directory; defaults to `~/oc-demo`. */
  dir?: string;
};

/** Verify `opencode`, `tmux`, and `terminal-svg` are on PATH; log their versions. */
export async function assertRecordingTools(): Promise<void> {
  for (const tool of [
    { name: "opencode", args: ["--version"] },
    { name: "tmux", args: ["-V"] },
  ]) {
    const result = await run([tool.name, ...tool.args], { timeoutMs: 30_000 });
    if (result.code !== 0)
      throw new Error(`${tool.name} is required for recording (not found on PATH)`);
    console.log(result.stdout.trim().split("\n")[0]);
  }
  const terminalSvg = await run([process.env.TERMINAL_SVG ?? "terminal-svg", "--version"]);
  if (terminalSvg.code !== 0) {
    throw new Error("terminal-svg is required: brew install russmckendrick/tap/terminal-svg");
  }
  console.log(terminalSvg.stdout.trim());
}

/** Record every take in sequence, each in its own throw-away project directory. */
export async function recordDemo(options: RecordDemoOptions): Promise<void> {
  const packageRoot = resolve(options.packageRoot);
  const assetsDir = join(packageRoot, "assets");
  const theme = options.theme ?? DEFAULT_THEME;
  const cursor = options.cursor ?? DEFAULT_CURSOR;
  const replyTimeoutMs = options.replyTimeoutMs ?? DEFAULT_REPLY_TIMEOUT_MS;
  const dir = resolve(options.dir ?? join(homedir(), "oc-demo"));

  await assertModelsAvailable(options.takes.map((take) => take.model));
  await mkdir(assetsDir, { recursive: true });
  for (const take of options.takes) {
    console.log(`\n=== ${take.name} ===`);
    await recordTake(take, {
      assetsDir,
      theme,
      tuiTheme: options.tuiTheme,
      cursor,
      from: options.from,
      replyTimeoutMs,
      dir,
    });
  }
}

/**
 * Fail before recording when a take's model is not registered in the local
 * OpenCode instance. The home screen follows `model.json`'s most-recent entry,
 * and when that entry names a provider/model the instance does not have (e.g.
 * a stale integration name) opencode silently falls back to the next recent
 * model — recording a demo of the wrong statusline. The catalog registers
 * asynchronously after a service start, so poll briefly before giving up.
 */
async function assertModelsAvailable(models: ModelRef[], timeoutMs = 60_000): Promise<void> {
  const missing = new Map(models.map((model) => [`${model.providerID}/${model.id}`, model]));
  const deadline = Date.now() + timeoutMs;
  let sawList = false;
  for (;;) {
    const listed = await run(["opencode", "api", "get", "/api/model"], { timeoutMs: 30_000 });
    if (listed.code === 0) {
      try {
        const data =
          (JSON.parse(listed.stdout) as { data?: Array<{ providerID?: string; modelID?: string }> })
            .data ?? [];
        sawList = true;
        for (const [key, model] of missing) {
          if (
            data.some(
              (entry) => entry.providerID === model.providerID && entry.modelID === model.id,
            )
          ) {
            missing.delete(key);
          }
        }
        if (missing.size === 0) return;
      } catch {
        // Unparseable response; retry until the deadline.
      }
    }
    if (Date.now() >= deadline) {
      if (!sawList) {
        console.warn("could not verify model availability (no /api/model response); continuing");
        return;
      }
      throw new Error(
        `model ${[...missing.keys()].join(", ")} is not available in this OpenCode instance; ` +
          `the home screen would silently fall back to another recent model. Check the integration/credential, ` +
          `or override the model in record-demo.config.json.`,
      );
    }
    await Bun.sleep(2_000);
  }
}

/** Quote a string for a `/bin/sh` command line. */
function shq(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * Pin the home screen's model: the composer line (and therefore which
 * statusline renders) follows the globally most-recent model in opencode's
 * `model.json`, not the project config — a stale entry (e.g. a Go model from
 * an unrelated session) silently produces the wrong demo. Prepends the take's
 * model to `recent` and returns a restore callback for the original content.
 */
async function pinRecentModel(model: ModelRef): Promise<() => Promise<void>> {
  const stateDir = process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state");
  const path = join(stateDir, "opencode", "model.json");
  const file = Bun.file(path);
  if (!(await file.exists())) return async () => {};
  const original = await file.text();
  const parsed = JSON.parse(original) as {
    recent?: Array<{ providerID?: string; modelID?: string }>;
  };
  const recent = (parsed.recent ?? []).filter(
    (entry) => entry.providerID !== model.providerID || entry.modelID !== model.id,
  );
  recent.unshift({ providerID: model.providerID, modelID: model.id });
  parsed.recent = recent;
  await Bun.write(path, JSON.stringify(parsed));
  return async () => {
    await Bun.write(path, original);
  };
}

async function recordTake(
  take: DemoTake,
  ctx: {
    assetsDir: string;
    theme: string;
    tuiTheme?: string;
    cursor: CursorStyle;
    from?: number;
    replyTimeoutMs: number;
    dir: string;
  },
): Promise<void> {
  const projectDir = ctx.dir;
  await rm(projectDir, { recursive: true, force: true });
  await mkdir(projectDir, { recursive: true });
  // opencode stores the canonical directory in a session, so match on it
  // (e.g. `--dir /tmp/x` is `/private/tmp/x` on macOS).
  const canonicalDir = await realpath(projectDir);
  await writeFile(
    join(projectDir, "opencode.json"),
    JSON.stringify(
      {
        $schema: "https://opencode.ai/config.json",
        model: `${take.model.providerID}/${take.model.id}`,
      },
      null,
      2,
    ) + "\n",
  );

  const tmuxSocket = `oc-demo-${process.pid}`;
  const svgPath = join(ctx.assetsDir, `${take.outputBasename}.svg`);
  const castPath = join(ctx.assetsDir, `${take.outputBasename}.cast`);
  const rawSvgPath = join(projectDir, "recording.svg");
  const paneScript = join(projectDir, "record.sh");
  const paneEnv: Env = take.env ?? {};

  const tmux = (...args: string[]) =>
    run(["tmux", "-L", tmuxSocket, "-f", "/dev/null", ...args], { env: paneEnv });
  const mustTmux = async (...args: string[]) => {
    const result = await tmux(...args);
    if (result.code !== 0)
      throw new Error(`tmux ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
    return result;
  };
  const capture = async () => (await mustTmux("capture-pane", "-p", "-t", SESSION)).stdout;
  const waitFor = async (marker: string, timeoutMs: number) => {
    const deadline = Date.now() + timeoutMs;
    let frame = "";
    while (Date.now() < deadline) {
      frame = await capture();
      if (frame.includes(marker)) return frame;
      await Bun.sleep(1_000);
    }
    throw new Error(`timed out waiting for ${JSON.stringify(marker)}; last frame:\n${frame}`);
  };

  let frame = "";
  const restoreModel = await pinRecentModel(take.model);
  try {
    await rm(svgPath, { force: true });
    await rm(castPath, { force: true });

    // Plain `opencode` starts on the home screen (logo + composer); the
    // session is created by the first prompt and deleted in cleanup. CLI
    // settings (like the TUI theme) have no project-local file, so a themed
    // take is handed to the TUI as inline CLI settings in this throw-away
    // script — the developer's own global `cli.json` stays untouched.
    const paneLines = ["#!/usr/bin/env bash"];
    if (ctx.tuiTheme) {
      paneLines.push(
        `export OPENCODE_CLI_CONFIG_CONTENT=${shq(JSON.stringify({ theme: { name: ctx.tuiTheme } }))}`,
      );
    }
    paneLines.push(
      `exec ${process.env.TERMINAL_SVG ?? "terminal-svg"} rec -c ${COLS} -r ${ROWS} ` +
        `-o ${shq(rawSvgPath)} --cast ${shq(castPath)} -- opencode`,
      "",
    );
    await writeFile(paneScript, paneLines.join("\n"));

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
    );

    console.log("waiting for the TUI");
    await waitFor(READY_MARKER, 120_000);
    await Bun.sleep(HOME_SCREEN_PAUSE_MS);

    console.log(`typing: ${take.prompt}`);
    for (const char of take.prompt) {
      await mustTmux("send-keys", "-t", SESSION, "-l", char);
      await Bun.sleep(TYPE_DELAY_MS);
    }
    await mustTmux("send-keys", "-t", SESSION, "C-m");

    console.log("waiting for the reply");
    await waitFor(DONE_MARKER, ctx.replyTimeoutMs);
    await Bun.sleep(1_500);

    // `rec` has no --timeout: quit the TUI and the recorder renders on exit.
    // Escape clears any autocomplete before ctrl+c exits (app_exit keybind).
    await mustTmux("send-keys", "-t", SESSION, "Escape");
    await Bun.sleep(300);
    await mustTmux("send-keys", "-t", SESSION, "C-c");
    for (let i = 0; ; i++) {
      if (i >= 60) throw new Error("the recording session did not exit after ctrl+c");
      if ((await tmux("has-session", "-t", SESSION)).code !== 0) break;
      await Bun.sleep(1_000);
    }

    // The cast ends with opencode restoring the primary screen; cut there so
    // the animation holds the finished conversation instead of the exit frame.
    const repaired = await repairCast(castPath);
    if (repaired > 0)
      console.warn(
        `repaired ${repaired} corrupted cast event(s) (terminal-svg chunk-boundary bug)`,
      );
    const exitAt = await altScreenExitTime(castPath);
    if (exitAt === undefined)
      console.warn("no alt-screen exit found; rendering to the end of the cast");
    await retitleCast(castPath, WINDOW_TITLE);

    // Skip the blank terminal (and its collapsing window) before the first
    // paint: open on opencode's home screen.
    const from = ctx.from ?? (await firstPaintTime(castPath));

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
      "--cursor",
      ctx.cursor,
      "--no-embed-source",
      "-o",
      svgPath,
    ];
    if (from !== undefined) render.push("--from", String(from));
    if (exitAt !== undefined) render.push("--to", String(exitAt));
    const rendered = await run(render);
    if (rendered.code !== 0)
      throw new Error(`terminal-svg failed:\n${rendered.stderr || rendered.stdout}`);
    const sealed = await sealTiledRects(svgPath);
    if (sealed > 0)
      console.log(
        `sealed ${sealed} tiled background rect(s) for seam-free scaling (terminal-svg#3)`,
      );

    console.log(`wrote ${svgPath}\n      ${castPath}`);
  } catch (error) {
    frame = frame || (await capture().catch(() => ""));
    if (frame) console.error(`last frame:\n${frame}`);
    throw error;
  } finally {
    await run(["tmux", "-L", tmuxSocket, "kill-server"]);
    await deleteSessionsFor(canonicalDir);
    await rm(projectDir, { recursive: true, force: true });
    await restoreModel();
  }
}

/**
 * Repair a terminal-svg cast corrupted at a 1024-byte read boundary: its PTY
 * reader decodes each read as UTF-8 independently, so a multi-byte glyph
 * split across the boundary becomes `U+FFFD` at the end of one output event
 * plus a stray continuation byte (`U+FFFD`) at the start of the next — e.g.
 * `\x1b[12;63H\uFFFD` / `\uFFFD\x1b[12;64H`. Both sit in the same cell (the
 * continuation byte is never drawn), so the original glyph is the two
 * replacement characters in event order; substituting a `▀` and dropping the
 * leftover byte restores the screen. Upstream: russmckendrick/terminal-svg#4
 * (remove this once fixed). Returns the number of repaired pairs.
 */
async function repairCast(castPath: string): Promise<number> {
  const text = await Bun.file(castPath).text();
  const lines = text.split("\n");
  const events = new Map<number, [number, string, string]>();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || !line.includes("\ufffd")) continue;
    try {
      const event = JSON.parse(line) as [number, string, string];
      if (event[1] === "o" && typeof event[2] === "string") events.set(i, event);
    } catch {
      // leave malformed lines untouched
    }
  }

  let repaired = 0;
  const drop = new Set<number>();
  const indexes = [...events.keys()].sort((a, b) => a - b);
  const consumed = new Set<number>();
  for (const index of indexes) {
    if (consumed.has(index)) continue;
    const event = events.get(index)!;
    const data = event[2];
    if (!data.includes("\ufffd")) continue;
    const nextIndex = index + 1;
    const next = events.get(nextIndex);
    if (
      data.endsWith("\ufffd") &&
      !data.endsWith("\ufffd\ufffd") &&
      next &&
      next[2].startsWith("\ufffd")
    ) {
      // The glyph split across two events: the trailing U+FFFD is its start,
      // and the leading U+FFFD(s) of the next event are stray continuation
      // bytes (the first pairs with the split, any further ones are orphans).
      event[2] = data.replace(/\ufffd$/, "\u2580");
      next[2] = next[2].replace(/^\ufffd+/, "");
      consumed.add(nextIndex);
      if (next[2] === "") {
        drop.add(nextIndex);
        events.delete(nextIndex);
      } else {
        lines[nextIndex] = JSON.stringify([next[0], next[1], next[2]]);
      }
      repaired++;
    } else if (data.includes("\ufffd\ufffd")) {
      // Both halves landed in one event.
      event[2] = data.replaceAll("\ufffd\ufffd", "\u2580");
      repaired++;
    } else {
      continue;
    }
    lines[index] = JSON.stringify([event[0], event[1], event[2]]);
  }
  if (repaired > 0) {
    const kept = lines.filter((_, index) => !drop.has(index));
    await Bun.write(castPath, kept.join("\n"));
  }
  return repaired;
}

/** Best effort: delete every session whose directory is the throw-away dir. */
async function deleteSessionsFor(directory: string): Promise<void> {
  const listed = await run(["opencode", "api", "get", "/api/session"], { timeoutMs: 30_000 });
  if (listed.code !== 0) return;
  let sessions: Array<{ id?: string; location?: { directory?: string } }>;
  try {
    sessions = (JSON.parse(listed.stdout) as { data?: typeof sessions }).data ?? [];
  } catch {
    return;
  }
  for (const session of sessions) {
    if (session.id && session.location?.directory === directory) {
      await run(["opencode", "api", "delete", `/api/session/${session.id}`], { timeoutMs: 30_000 });
    }
  }
}

/** Time of the last `ESC[?1049l` (leaving the alternate screen) in the cast. */
async function altScreenExitTime(castPath: string): Promise<number | undefined> {
  const text = await Bun.file(castPath).text();
  let exitAt: number | undefined;
  for (const line of text.split("\n")) {
    const event = parseEvent(line);
    if (!event) continue;
    const [time, type, data] = event;
    if (type === "o" && typeof data === "string" && data.includes("\u001b[?1049l")) exitAt = time;
  }
  return exitAt === undefined ? undefined : Math.max(0, exitAt - 0.01);
}

/**
 * Start of the TUI's first real paint: the first output event that sets an
 * explicit background (the blank terminal before it only uses default
 * colours). A short beat later the home screen is fully drawn.
 */
async function firstPaintTime(castPath: string): Promise<number | undefined> {
  const text = await Bun.file(castPath).text();
  for (const line of text.split("\n")) {
    const event = parseEvent(line);
    if (!event) continue;
    const [time, type, data] = event;
    if (type === "o" && typeof data === "string" && /\u001b\[(?:48;[25];|4[0-7]m)/.test(data)) {
      return time + 0.3;
    }
  }
  return undefined;
}

function parseEvent(line: string): [number, string, unknown] | undefined {
  if (!line.trim()) return undefined;
  let event: unknown;
  try {
    event = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!Array.isArray(event) || typeof event[0] !== "number" || typeof event[1] !== "string")
    return undefined;
  return event as [number, string, unknown];
}

/** Rewrite the cast header title (`rec` stores the command string there). */
async function retitleCast(castPath: string, title: string): Promise<void> {
  const text = await Bun.file(castPath).text();
  const newline = text.indexOf("\n");
  if (newline < 0) return;
  const header = JSON.parse(text.slice(0, newline)) as { title?: string };
  header.title = title;
  await Bun.write(castPath, JSON.stringify(header) + text.slice(newline));
}

/**
 * Add `shape-rendering="crispEdges"` to the tiled background rects: their
 * shared edges sit at fractional coordinates, so with independent
 * antialiasing the window background shows through as a hairline seam once
 * the SVG is displayed at a fractional scale (e.g. scaled down in a README,
 * or on a HiDPI screen). Rects with `rx` (the rounded window body) keep their
 * smooth corners. Upstream: russmckendrick/terminal-svg#3 (remove this once
 * fixed). Returns the number of rects patched.
 */
async function sealTiledRects(svgPath: string): Promise<number> {
  const svg = await Bun.file(svgPath).text();
  let patched = 0;
  const sealed = svg.replace(/<rect\b[^>]*>/g, (tag) => {
    if (tag.includes("rx=") || tag.includes("shape-rendering=")) return tag;
    patched++;
    return tag.replace("<rect", `<rect shape-rendering="crispEdges"`);
  });
  if (patched > 0) await Bun.write(svgPath, sealed);
  return patched;
}
