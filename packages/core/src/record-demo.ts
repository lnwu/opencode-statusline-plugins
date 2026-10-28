// Shared README demo recorder: drives a real OpenCode TUI in a fixed-size
// tmux pane, wrapped in `asciinema rec`, and renders the finished cast to an
// animated SVG with `terminal-record` (plus the asciicast master). Package
// wrappers (`opencode-go-statusline/scripts/record-demo.ts`,
// `opencode-copilot-statusline/scripts/record-demo.ts`) configure the takes;
// this module has no notion of locale or footer label text, only "what to
// type, in what environment, into which output file".
//
// Always local: uses the developer's own OpenCode configuration and
// credentials, in a throw-away project directory (default `~/oc-demo`,
// deleted before and after each take); the throw-away session is deleted too.
//
// The recorded TUI runs `opencode --standalone` (a private server, so the
// developer's background service is never touched) with `XDG_CONFIG_HOME`
// pointed at a throw-away config home (`prepareConfigHome`): a copy of the
// developer's `opencode.json` and `cli.json` (theme, `session.tps`, ...)
// minus the `cli.json` `plugins` list, plus re-export shims that load the
// package's built `dist/` as a global plugin, the same way the e2e harness
// does. The demo therefore shows the working tree's statusline and the
// built-in footer, never the developer's own TUI plugins. Credentials live in
// the data directory and are shared.
//
// The take opens on opencode's home screen (logo + composer), types the
// prompt, waits for the reply to finish, then quits. `terminal-record` has no
// trimming or cursor options, so the recorder edits the cast itself
// (`trimCast`): everything before the TUI's first paint is folded into one
// instant event (the screen state survives, the blank/collapsing terminal is
// never shown), everything after the alt-screen exit is dropped, the timeline
// is sped up, and the cursor is hidden by default (`cursor: "block"` to keep
// it) so the README image stays clean. The edited cast is the committed
// master, so re-rendering it reproduces the SVG.
//
// The home screen's model (and therefore which statusline renders) follows
// the globally most-recent model in opencode's `model.json`, not the project
// config, so each take temporarily pins its model there and restores the
// original file when done. Before the first take, each unique take model is
// verified against the local `/api/model` catalog: when the pinned entry
// names a provider/model the instance does not have, opencode silently falls
// back to the next recent model, and the check fails loudly instead. A take
// can likewise pin the TUI theme (`tuiTheme`), written into the throw-away
// `cli.json`; the developer's own global `cli.json` is never touched.
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { run, type Env } from "./run";
import type { ModelRef } from "./harness";

const COLS = 120;
const ROWS = 28;
const SESSION = "demo";
const TYPE_DELAY_MS = 50;
/** Hold the home screen briefly before typing so the logo is readable. */
const HOME_SCREEN_PAUSE_MS = 700;
const IDLE_TIME_LIMIT = 1.2;
const SPEED = 1.25;
export const DEFAULT_REPLY_TIMEOUT_MS = 180_000;
/** `terminal-record --theme`: `auto` uses the palette asciinema stored in the cast. */
export const DEFAULT_THEME: RenderTheme = "dark";
/** Default cursor style: no cursor keeps the README image clean. */
export const DEFAULT_CURSOR: CursorStyle = "none";
/** Window title shown in the SVG chrome (stored in the cast header). */
const WINDOW_TITLE = "opencode";
/** Home-screen footer hint; present once the TUI is ready for input. */
const READY_MARKER = "ctrl+p";
/** Assistant metadata line; present once a turn has finished. */
const DONE_MARKER = "tok/s";

/** `terminal-record` always draws a block cursor; `none` hides it in the cast. */
export type CursorStyle = "block" | "none";
export type RenderTheme = "auto" | "dark" | "light";
export const RENDER_THEMES: RenderTheme[] = ["auto", "dark", "light"];

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
  /** Model to record with, as `provider/id` (e.g. `github-copilot/gpt-6-luna`). */
  model?: string;
  /** Prompt to type; overrides the wrapper's default for every take. */
  prompt?: string;
  cursor?: CursorStyle;
  theme?: RenderTheme;
  /** OpenCode TUI theme for the recording (e.g. "aura"); defaults to the developer's own theme. */
  tuiTheme?: string;
  /** How long to wait for a finished turn, in ms. */
  replyTimeout?: number;
  /** Throw-away project directory; defaults to `~/oc-demo`. */
  dir?: string;
};

const CONFIG_FILENAME = "record-demo.config.json";
const TERMINAL_RECORD = process.env.TERMINAL_RECORD ?? "terminal-record";

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
    throw new Error(
      `${path} is not valid JSON: ${error instanceof Error ? error.message : error}`,
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${path} must be a JSON object`);
  }
  const raw = parsed as Record<string, unknown>;
  const config: DemoConfig = {};
  if (raw.model !== undefined) {
    if (typeof raw.model !== "string" || !raw.model.includes("/")) {
      throw new Error(
        `${path}: "model" must be "provider/id", got ${JSON.stringify(raw.model)}`,
      );
    }
    config.model = raw.model;
  }
  if (raw.prompt !== undefined) {
    if (typeof raw.prompt !== "string" || raw.prompt === "")
      throw new Error(`${path}: "prompt" must be a non-empty string`);
    config.prompt = raw.prompt;
  }
  if (raw.cursor !== undefined) {
    if (raw.cursor !== "block" && raw.cursor !== "none") {
      throw new Error(
        `${path}: "cursor" must be block|none, got ${JSON.stringify(raw.cursor)}`,
      );
    }
    config.cursor = raw.cursor;
  }
  if (raw.theme !== undefined) {
    if (!RENDER_THEMES.includes(raw.theme as RenderTheme))
      throw new Error(
        `${path}: "theme" must be ${RENDER_THEMES.join("|")}, got ${JSON.stringify(raw.theme)}`,
      );
    config.theme = raw.theme as RenderTheme;
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
      throw new Error(
        `${path}: "replyTimeout" must be a positive number of milliseconds`,
      );
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
  theme?: RenderTheme;
  /** OpenCode TUI theme for the recording; defaults to the developer's own theme. */
  tuiTheme?: string;
  /** Cursor shape in the rendered SVG; defaults to `none` for a clean README image. */
  cursor?: CursorStyle;
  /** Start the animation here (seconds into the raw recording) instead of the TUI's first paint. */
  from?: number;
  replyTimeoutMs?: number;
  /** Throw-away project directory; defaults to `~/oc-demo`. */
  dir?: string;
};

/** Verify `opencode`, `tmux`, `asciinema`, and `terminal-record` are on PATH; log their versions. */
export async function assertRecordingTools(): Promise<void> {
  for (const tool of [
    { name: "opencode", args: ["--version"], hint: "" },
    { name: "tmux", args: ["-V"], hint: "" },
    { name: "asciinema", args: ["--version"], hint: " (asciinema 3+)" },
    {
      name: TERMINAL_RECORD,
      args: ["--version"],
      hint: " (cargo install --path . --locked in a terminal-record checkout)",
    },
  ]) {
    const result = await run([tool.name, ...tool.args], { timeoutMs: 30_000 });
    if (result.code !== 0)
      throw new Error(
        `${tool.name} is required for recording (not found on PATH)${tool.hint}`,
      );
    console.log(result.stdout.trim().split("\n")[0]);
  }
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
  const configHome = await prepareConfigHome(packageRoot, options.tuiTheme);
  try {
    for (const take of options.takes) {
      console.log(`\n=== ${take.name} ===`);
      await recordTake(take, {
        assetsDir,
        configHome,
        theme,
        cursor,
        from: options.from,
        replyTimeoutMs,
        dir,
      });
    }
  } finally {
    await rm(configHome, { recursive: true, force: true });
  }
}

/**
 * Build the throw-away `XDG_CONFIG_HOME` for the recorded TUI: the
 * developer's `opencode.json` and `cli.json` without its `plugins` list (which
 * can disable the built-in footer or swap in the developer's own), and the
 * package's built entries as a global plugin. Returns its path.
 */
async function prepareConfigHome(
  packageRoot: string,
  tuiTheme: string | undefined,
): Promise<string> {
  const entries = ["index.js", "tui.js"].map((name) =>
    join(packageRoot, "dist", name),
  );
  for (const entry of entries) {
    if (!(await Bun.file(entry).exists()))
      throw new Error(`${entry} is missing — run \`bun run build\` first`);
  }
  const home = await mkdtemp(join(tmpdir(), "oc-demo-config-"));
  const config = join(home, "opencode");
  const plugin = join(config, "plugins", "statusline");
  await mkdir(plugin, { recursive: true });
  await writeFile(
    join(plugin, "index.ts"),
    `export { default } from "file://${entries[0]}"\n`,
  );
  await writeFile(
    join(plugin, "tui.tsx"),
    `export { default } from "file://${entries[1]}"\n`,
  );

  const userConfig = join(
    process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
    "opencode",
  );
  const server = Bun.file(join(userConfig, "opencode.json"));
  if (await server.exists())
    await Bun.write(join(config, "opencode.json"), server);
  const cliFile = Bun.file(join(userConfig, "cli.json"));
  const cli = ((await cliFile.exists()) ? await cliFile.json() : {}) as Record<
    string,
    unknown
  >;
  delete cli.plugins;
  if (tuiTheme) cli.theme = { ...(cli.theme as object), name: tuiTheme };
  await writeFile(join(config, "cli.json"), JSON.stringify(cli, null, 2));
  return home;
}

/**
 * Fail before recording when a take's model is not registered in the local
 * OpenCode instance. The home screen follows `model.json`'s most-recent entry,
 * and when that entry names a provider/model the instance does not have (e.g.
 * a stale integration name) opencode silently falls back to the next recent
 * model — recording a demo of the wrong statusline. The catalog registers
 * asynchronously after a service start, so poll briefly before giving up.
 */
async function assertModelsAvailable(
  models: ModelRef[],
  timeoutMs = 60_000,
): Promise<void> {
  const missing = new Map(
    models.map((model) => [`${model.providerID}/${model.id}`, model]),
  );
  const deadline = Date.now() + timeoutMs;
  let sawList = false;
  for (;;) {
    const listed = await run(["opencode", "api", "get", "/api/model"], {
      timeoutMs: 30_000,
    });
    if (listed.code === 0) {
      try {
        const data =
          (
            JSON.parse(listed.stdout) as {
              data?: Array<{ providerID?: string; modelID?: string }>;
            }
          ).data ?? [];
        sawList = true;
        for (const [key, model] of missing) {
          if (
            data.some(
              (entry) =>
                entry.providerID === model.providerID &&
                entry.modelID === model.id,
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
        console.warn(
          "could not verify model availability (no /api/model response); continuing",
        );
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
  const stateDir =
    process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state");
  const path = join(stateDir, "opencode", "model.json");
  const file = Bun.file(path);
  if (!(await file.exists())) return async () => {};
  const original = await file.text();
  const parsed = JSON.parse(original) as {
    recent?: Array<{ providerID?: string; modelID?: string }>;
  };
  const recent = (parsed.recent ?? []).filter(
    (entry) =>
      entry.providerID !== model.providerID || entry.modelID !== model.id,
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
    configHome: string;
    theme: RenderTheme;
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
  const rawCastPath = join(projectDir, "recording.cast");
  const paneScript = join(projectDir, "record.sh");
  const paneEnv: Env = take.env ?? {};

  const tmux = (...args: string[]) =>
    run(["tmux", "-L", tmuxSocket, "-f", "/dev/null", ...args], {
      env: paneEnv,
    });
  const mustTmux = async (...args: string[]) => {
    const result = await tmux(...args);
    if (result.code !== 0)
      throw new Error(
        `tmux ${args.join(" ")} failed:\n${result.stderr || result.stdout}`,
      );
    return result;
  };
  const capture = async () =>
    (await mustTmux("capture-pane", "-p", "-t", SESSION)).stdout;
  const waitFor = async (marker: string, timeoutMs: number) => {
    const deadline = Date.now() + timeoutMs;
    let frame = "";
    while (Date.now() < deadline) {
      frame = await capture();
      if (frame.includes(marker)) return frame;
      await Bun.sleep(1_000);
    }
    throw new Error(
      `timed out waiting for ${JSON.stringify(marker)}; last frame:\n${frame}`,
    );
  };

  let frame = "";
  const restoreModel = await pinRecentModel(take.model);
  try {
    await rm(svgPath, { force: true });
    await rm(castPath, { force: true });

    // Plain `opencode` starts on the home screen (logo + composer); the
    // session is created by the first prompt and deleted in cleanup.
    const paneLines = [
      "#!/usr/bin/env bash",
      `export XDG_CONFIG_HOME=${shq(ctx.configHome)}`,
      `exec asciinema rec --quiet --overwrite --title ${WINDOW_TITLE} ` +
        `--idle-time-limit ${IDLE_TIME_LIMIT} ` +
        `--command 'opencode --standalone' ${shq(rawCastPath)}`,
      "",
    ];
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

    // Quit the TUI; `asciinema rec` finishes the cast when its command exits.
    // Escape clears any autocomplete before ctrl+c exits (app_exit keybind).
    await mustTmux("send-keys", "-t", SESSION, "Escape");
    await Bun.sleep(300);
    await mustTmux("send-keys", "-t", SESSION, "C-c");
    for (let i = 0; ; i++) {
      if (i >= 60)
        throw new Error("the recording session did not exit after ctrl+c");
      if ((await tmux("has-session", "-t", SESSION)).code !== 0) break;
      await Bun.sleep(1_000);
    }

    // Open on opencode's home screen (skip the blank terminal and its
    // collapsing window before the first paint) and end at the alt-screen
    // exit, so the animation holds the finished conversation instead of the
    // exit frame.
    const raw = parseCast(await Bun.file(rawCastPath).text());
    const from = ctx.from ?? firstPaintTime(raw.events);
    const to = altScreenExitTime(raw.events);
    if (to === undefined)
      console.warn(
        "no alt-screen exit found; rendering to the end of the cast",
      );
    await Bun.write(
      castPath,
      trimCast(raw, { from, to, hideCursor: ctx.cursor === "none" }),
    );

    const rendered = await run([
      TERMINAL_RECORD,
      castPath,
      "--theme",
      ctx.theme,
      "-o",
      svgPath,
    ]);
    if (rendered.code !== 0)
      throw new Error(
        `terminal-record failed:\n${rendered.stderr || rendered.stdout}`,
      );

    console.log(`wrote ${svgPath}\n      ${castPath}`);
  } catch (error) {
    frame = frame || (await capture().catch(() => ""));
    if (frame) console.error(`last frame:\n${frame}`);
    throw error;
  } finally {
    await run(["tmux", "-L", tmuxSocket, "kill-server"]);
    // asciinema survives the pane's hangup (asciinema 3.2.1), so a take that
    // failed before the TUI exited would leave it and opencode running.
    await run(["pkill", "-f", `asciinema rec .*${rawCastPath}`]);
    await deleteSessionsFor(canonicalDir);
    await rm(projectDir, { recursive: true, force: true });
    await restoreModel();
  }
}

/** Best effort: delete every session whose directory is the throw-away dir. */
async function deleteSessionsFor(directory: string): Promise<void> {
  const listed = await run(["opencode", "api", "get", "/api/session"], {
    timeoutMs: 30_000,
  });
  if (listed.code !== 0) return;
  let sessions: Array<{ id?: string; location?: { directory?: string } }>;
  try {
    sessions =
      (JSON.parse(listed.stdout) as { data?: typeof sessions }).data ?? [];
  } catch {
    return;
  }
  for (const session of sessions) {
    if (session.id && session.location?.directory === directory) {
      await run(["opencode", "api", "delete", `/api/session/${session.id}`], {
        timeoutMs: 30_000,
      });
    }
  }
}

type CastEvent = [interval: number, code: string, data: unknown];
type Cast = { header: string; events: CastEvent[] };

/** Split an asciicast v3 file into its header line and events. */
function parseCast(text: string): Cast {
  const [header = "", ...lines] = text.split("\n");
  const events: CastEvent[] = [];
  for (const line of lines) {
    if (!line.trim() || line.startsWith("#")) continue;
    const event = JSON.parse(line) as unknown;
    if (
      Array.isArray(event) &&
      typeof event[0] === "number" &&
      typeof event[1] === "string"
    )
      events.push(event as CastEvent);
  }
  return { header, events };
}

/** v3 events carry the interval since the previous event; yield absolute times. */
function* timed(events: CastEvent[]): Generator<[number, CastEvent]> {
  let time = 0;
  for (const event of events) {
    time += event[0];
    yield [time, event];
  }
}

/** Time of the last `ESC[?1049l` (leaving the alternate screen). */
function altScreenExitTime(events: CastEvent[]): number | undefined {
  let exitAt: number | undefined;
  for (const [time, [, code, data]] of timed(events)) {
    if (
      code === "o" &&
      typeof data === "string" &&
      data.includes("\u001b[?1049l")
    )
      exitAt = time;
  }
  return exitAt;
}

/**
 * Start of the TUI's first real paint: the first output event that sets an
 * explicit background (the blank terminal before it only uses default
 * colours). A short beat later the home screen is fully drawn.
 */
function firstPaintTime(events: CastEvent[]): number | undefined {
  for (const [time, [, code, data]] of timed(events)) {
    if (
      code === "o" &&
      typeof data === "string" &&
      /\u001b\[(?:48;[25];|4[0-7]m)/.test(data)
    )
      return time + 0.3;
  }
  return undefined;
}

const SHOW_CURSOR = "\u001b[?25h";
const HIDE_CURSOR = "\u001b[?25l";

/**
 * Cut the cast to `[from, to)` without losing screen state: output events are
 * screen deltas, so the head is folded into a single zero-interval event
 * instead of dropped, and only the tail after `to` (the exit frame) is
 * dropped. Intervals are divided by `SPEED`; `hideCursor` removes every
 * show-cursor sequence because `terminal-record` always draws a visible
 * cursor.
 */
function trimCast(
  cast: Cast,
  options: { from?: number; to?: number; hideCursor: boolean },
): string {
  const { from = 0, to = Infinity, hideCursor } = options;
  const out: CastEvent[] = [];
  let head = hideCursor ? HIDE_CURSOR : "";
  let last = from;
  for (const [time, event] of timed(cast.events)) {
    if (time >= to) break;
    let [, code, data] = event;
    if (hideCursor && code === "o" && typeof data === "string")
      data = data.replaceAll(SHOW_CURSOR, "");
    if (time < from) {
      if (code === "o" && typeof data === "string") head += data;
      else if (code === "r") {
        // Keep a resize in order with the output around it.
        if (head) out.push([0, "o", head]);
        head = "";
        out.push([0, code, data]);
      }
      continue;
    }
    if (head) {
      out.push([0, "o", head]);
      head = "";
    }
    out.push([Math.round(((time - last) / SPEED) * 1e6) / 1e6, code, data]);
    last = time;
  }
  if (head) out.push([0, "o", head]);
  return (
    [cast.header, ...out.map((event) => JSON.stringify(event))].join("\n") +
    "\n"
  );
}
