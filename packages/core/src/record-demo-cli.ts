// Shared CLI front end for the per-package demo recorder wrappers: the flag
// set, defaults, `--help` text, and config-file merging are the same across
// packages, so this module owns them and each wrapper declares only its
// default model and takes.
//
// `RecordDemoCli.takes` describes what the recorder can record (take name,
// output basename, default prompt, environment). A single take means no
// `--locale` flag; with several, `--locale <name>` selects one and
// `--locale all` resets to every take. `--prompt` and the gitignored
// `record-demo.config.json`'s `prompt` override the prompt of every selected
// take. The result plugs into `recordDemo()` as-is.
import { homedir } from "node:os";
import { join } from "node:path";
import type { ModelRef } from "./harness";
import type { CursorStyle, DemoConfig, DemoTake } from "./record-demo";
import type { Env } from "./run";

const DEFAULT_THEME = "github-dark";
const DEFAULT_CURSOR: CursorStyle = "none";
const DEFAULT_DIR = "~/oc-demo";

export type DemoTakeDefault = {
  /** Take name; also the `--locale` value when there is more than one. */
  name: string;
  /** Output basename under `assets/`, without extension. */
  outputBasename: string;
  /** Default prompt for this take. */
  prompt: string;
  /** Extra env for the recorded pane, e.g. `LANG` for locale-specific labels. */
  env?: Env;
};

export type RecordDemoCli = {
  /** Default model; shown in `--help` and used unless the config or a flag overrides it. */
  defaultModel: ModelRef;
  /** Every take the CLI can record. */
  takes: DemoTakeDefault[];
};

export type RecordDemoArgs = {
  takes: DemoTake[];
  theme: string;
  tuiTheme?: string;
  cursor: CursorStyle;
  from?: number;
  replyTimeoutMs?: number;
  dir?: string;
};

/** Expand a leading `~` so `--dir ~/demo` works from any shell. */
function expandHome(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return join(homedir(), value.slice(2));
  return value;
}

function need(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value) throw new Error(`${flag} needs a value`);
  return value;
}

function parseModel(value: string): ModelRef {
  const slash = value.indexOf("/");
  if (slash < 0) throw new Error(`--model must be provider/id, got: ${value}`);
  return { providerID: value.slice(0, slash), id: value.slice(slash + 1) };
}

function usage(cli: RecordDemoCli, packageRoot: string): string {
  const locales = cli.takes.length > 1;
  const lines = ["usage: bun scripts/record-demo.ts [options]", ""];
  if (locales) {
    const names = cli.takes.map((take) => take.name).join("|");
    lines.push(`  --locale ${names}|all   Which demo(s) to record (default: all)`);
  }
  lines.push(
    locales
      ? "  --prompt <text>         Prompt to type; overrides the per-locale default\n" +
          `                          (${cli.takes
            .map((take) => `${take.name}: ${JSON.stringify(take.prompt)}`)
            .join(", ")})`
      : `  --prompt <text>         Prompt to type (default: ${JSON.stringify(cli.takes[0]!.prompt)})`,
    `  --model <provider/id>   Model to record with (default: ${cli.defaultModel.providerID}/${cli.defaultModel.id})`,
    `  --theme <name>          terminal-svg theme (default: ${DEFAULT_THEME})`,
    "  --tui-theme <name>      OpenCode TUI theme for the recording (inline CLI settings;",
    "                          default: your own theme)",
    "  --cursor <style>        Cursor shape in the SVG: block|bar|underline|none",
    `                          (default: ${DEFAULT_CURSOR})`,
    "  --from <seconds>        Start the animation here instead of the first paint",
    "  --reply-timeout <ms>    How long to wait for a finished turn (default: 180000)",
    `  --dir <path>            Throw-away project directory (default: ${DEFAULT_DIR})`,
    "",
    `Defaults can be set in ${join(packageRoot, "record-demo.config.json")}`,
    "(gitignored); CLI flags override it.",
  );
  return lines.join("\n");
}

/**
 * Merge the gitignored config file and the CLI flags into `recordDemo()`
 * options. Invalid values throw instead of silently recording the wrong thing.
 */
export function parseRecordDemoArgs(options: {
  cli: RecordDemoCli;
  config: DemoConfig;
  argv: string[];
  packageRoot: string;
}): RecordDemoArgs {
  const { cli, config, argv, packageRoot } = options;
  const locales = cli.takes.length > 1;
  let model = cli.defaultModel;
  let theme = config.theme ?? DEFAULT_THEME;
  let tuiTheme = config.tuiTheme;
  let cursor = config.cursor ?? DEFAULT_CURSOR;
  let from: number | undefined;
  let replyTimeoutMs = config.replyTimeout;
  let dir = config.dir ? expandHome(config.dir) : undefined;
  let prompt = config.prompt;
  let selected = cli.takes;

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case "--locale": {
        if (!locales) throw new Error(`unknown option: ${flag}\n\n${usage(cli, packageRoot)}`);
        const value = need(argv, i, flag);
        if (value === "all") {
          selected = cli.takes;
        } else {
          const take = cli.takes.find((candidate) => candidate.name === value);
          if (!take) throw new Error(`unknown locale: ${value}`);
          selected = [take];
        }
        i++;
        continue;
      }
      case "--prompt":
        prompt = need(argv, i, flag);
        i++;
        continue;
      case "--model":
        model = parseModel(need(argv, i, flag));
        i++;
        continue;
      case "--theme":
        theme = need(argv, i, flag);
        i++;
        continue;
      case "--tui-theme":
        tuiTheme = need(argv, i, flag);
        i++;
        continue;
      case "--cursor": {
        const value = need(argv, i, flag);
        if (value !== "block" && value !== "bar" && value !== "underline" && value !== "none") {
          throw new Error(`unknown cursor style: ${value}`);
        }
        cursor = value;
        i++;
        continue;
      }
      case "--from":
        from = Number(need(argv, i, flag));
        i++;
        continue;
      case "--reply-timeout":
        replyTimeoutMs = Number(need(argv, i, flag));
        i++;
        continue;
      case "--dir":
        dir = expandHome(need(argv, i, flag));
        i++;
        continue;
      case "--help":
      case "-h":
        console.log(usage(cli, packageRoot));
        process.exit(0);
      default:
        throw new Error(`unknown option: ${flag}\n\n${usage(cli, packageRoot)}`);
    }
  }

  return {
    takes: selected.map((take) => ({
      name: take.name,
      outputBasename: take.outputBasename,
      model,
      prompt: prompt ?? take.prompt,
      env: take.env,
    })),
    theme,
    tuiTheme,
    cursor,
    from,
    replyTimeoutMs,
    dir,
  };
}
