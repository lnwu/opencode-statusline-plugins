---
name: record-demo
description: Record or refresh the animated README demo for a statusline package — a real OpenCode TUI in a fixed-size tmux pane, recorded with asciinema and rendered to an SVG with terminal-record. Use when the user asks to record, re-record, or update the demo animation (录制 / 更新演示动图).
---

# Record the demo animation

The package READMEs show the statusline with an animated SVG recorded from a
real TUI session. `packages/core/src/record-demo.ts` (`recordDemo`) drives it:
tmux runs the real TUI inside `asciinema rec` at a fixed 120×28, the prompt is
typed with `tmux send-keys` so the animation shows it character by character,
and the finished cast is trimmed and rendered to an SVG with `terminal-record` (with the trimmed
`.cast` master kept next to it). The take starts on opencode's home screen
(logo + composer), and the animation opens at the first paint — the blank
terminal and its collapsing window are skipped.

`recordDemo` is always local and knows nothing about locale or footer label
text: it takes a list of **takes** (`{ name, outputBasename, model, prompt,
env? }`) and just records each one in a throw-away project directory (default
`~/oc-demo`, deleted before and after every take; the throw-away sessions are
deleted too). Each package's `scripts/record-demo.ts` is a thin wrapper that
builds its own take list and calls `recordDemo`:

- **`opencode-go-statusline`** — two takes (`en`, `zh-CN`), because the footer
  labels are bilingual (`5h / Weekly / Monthly` vs `5h / 周 / 月`). The only
  difference between them is the pane's `LANG`/`LC_ALL` and the prompt; output
  is `assets/demo.en.svg` / `assets/demo.zh-CN.svg`.
- **`opencode-copilot-statusline`** — a single take, since the statusline has
  no localizable text. Output is `assets/demo.svg` (no locale suffix).
- **`opencode-kimi-code-statusline`** — two takes (`en`, `zh-CN`), because the
  footer labels are bilingual (`5h / Weekly` vs `5h / 周`); output is
  `assets/demo.en.svg` / `assets/demo.zh-CN.svg`.

The recorded TUI is `opencode --standalone` (a private server; the
developer's background service is untouched) with `XDG_CONFIG_HOME` pointed at
a throw-away config home: a copy of the developer's `opencode.json` and
`cli.json` **without the `cli.json` `plugins` list**, plus re-export shims that
load the package's freshly built `dist/` as a global plugin. So the demo shows
the working tree's statusline next to the built-in footer, even when the
developer's own config disables that footer or swaps in personal TUI plugins.
Credentials live in the data directory and are the developer's own.

Per-developer defaults live in `<package>/record-demo.config.json`
(gitignored): `{ "model": "provider/id", "prompt": "...", "cursor": "none",
"theme": "dark", "tuiTheme": "aura", "replyTimeout": 180000, "dir":
"~/oc-demo" }`. All fields are optional; CLI flags override the file, and
invalid values fail loudly instead of recording the wrong thing.

The recorder hides the cursor in the SVG by default (`--cursor block|none`,
default `none`) and pins the take's model in opencode's global `model.json`
for the duration of the take, restoring the original file afterwards: the
home screen's model — and therefore which statusline renders — follows the
globally most-recent model, not the project config. With `--tui-theme` it
writes the theme into the throw-away `cli.json`.

## Prerequisites

- `opencode`, `tmux`, `asciinema` (3+, writes asciicast v3), and
  `terminal-record` on PATH. Install `terminal-record` from its checkout with
  `cargo install --path . --locked`; `TERMINAL_RECORD=<path>` overrides the
  binary.
- The package's own credential logged in locally: an OpenCode Go account for
  `opencode-go-statusline`, a GitHub Copilot account
  (`opencode auth login github-copilot`) for `opencode-copilot-statusline`,
  a Kimi For Coding account (`opencode auth login kimi-code-plan-global`, or
  `kimi-code-plan-cn` with a matching `--model`) for
  `opencode-kimi-code-statusline`
- Network access (models.dev; every take makes a real model call)

## Record

The committed demos use the `aura` TUI theme; pass `--tui-theme aura` (or set
`tuiTheme`) to keep them consistent.

```sh
# go: en and zh-CN
bun run --filter opencode-go-statusline record:demo -- --tui-theme aura

# go: one language; custom prompt
bun run --filter opencode-go-statusline record:demo -- --locale en
bun scripts/record-demo.ts --prompt "Say hi in one short sentence."

# copilot: single demo
bun run --filter opencode-copilot-statusline record:demo -- --tui-theme aura

# copilot: override the model if the default is rejected by your plan
# (Copilot Free is entitled to gpt-4o-mini-2024-07-18 only)
bun scripts/record-demo.ts --model github-copilot/gpt-4o-mini-2024-07-18

# kimi: en and zh-CN
bun run --filter opencode-kimi-code-statusline record:demo -- --tui-theme aura

# kimi: China plan (the committed demos were recorded this way)
bun scripts/record-demo.ts --model kimi-code-plan-cn/kimi-for-coding
```

There is no npm key needed. Each `record:demo` script builds `dist/` first.
For a persistent override, put it in `record-demo.config.json` instead of
passing the flag every time:

```jsonc
// packages/opencode-copilot-statusline/record-demo.config.json (gitignored)
{ "model": "github-copilot/claude-sonnet-5", "tuiTheme": "aura" }
```

- Common options (all packages): `--prompt "..."`, `--model <provider/id>`
  (defaults: go `opencode-go/deepseek-v4.1-flash`, copilot
  `github-copilot/gpt-6-luna`, kimi `kimi-code-plan-global/kimi-for-coding`),
  `--theme auto|dark|light` (window colors in `terminal-record`; default
  `dark`), `--tui-theme <opencode theme>` (default: the developer's own),
  `--cursor block|none` (default `none`), `--from <seconds>` (into the raw
  recording; defaults to the TUI's first paint), `--reply-timeout <ms>`
  (default `180000`), `--dir <path>` (default `~/oc-demo`).
- go and kimi: `--locale en|zh-CN|all` (default `all`); `--prompt` overrides
  both locales' default (en `Reply with exactly: ok`, zh-CN `请只回复：ok`).
- copilot: default prompt is `Reply with exactly: ok`.
- Outputs (repo-only; `files: ["dist"]` keeps them out of the npm tarball):
  - go: `assets/demo.en.svg`, `assets/demo.zh-CN.svg` (+ matching `.cast`)
  - copilot: `assets/demo.svg` (+ `assets/demo.cast`)
  - kimi: `assets/demo.en.svg`, `assets/demo.zh-CN.svg` (+ matching `.cast`)

## Verify

- Render single frames from the master and look at them in a browser (e.g.
  `agent-browser open file://… && agent-browser screenshot …`):
  `terminal-record assets/demo.en.cast --at 0 -o /tmp/first.svg` (opening
  frame) and `terminal-record assets/demo.en.cast --static -o /tmp/last.svg`
  (final frame).
- Check the window title (`opencode`), the opening frame (home screen with the
  logo), the prompt typing, the finished reply, and the footer quota (go:
  `Go 5h … · Weekly … · Monthly …`, `周` / `月` for zh-CN; copilot:
  `Copilot NN% (…)`; kimi: `Kimi 5h … · Weekly …`, `周` for zh-CN). Confirm
  the model line matches the take's model and the palette matches the
  requested `--tui-theme`, that no cursor block is rendered, and grep the SVG
  for `U+FFFD`.
- Eyeball for secrets and personal paths; the prompt and the model's reply are
  recorded verbatim.
- Re-render the animation from the master without re-recording:
  `terminal-record assets/demo.en.cast -o /tmp/demo.svg`. The master is
  already trimmed, sped up, and cursor-free, so this reproduces the SVG.

## Use in the README

- Adding or updating a README image is user-visible: land bilingual changelog
  entries in the same PR (`AGENTS.md` → Conventions).
- Reference assets by relative path (`./assets/demo.svg` or
  `./assets/demo.en.svg`); npm resolves relative asset paths for the package
  page.
- The demo SVG is the README's hero image. It is scaled down at README width,
  so keep the window size compact (120 columns) and check the result at that
  width.

## Gotchas

- **`terminal-record` only renders**: it has no trimming or cursor options,
  so `trimCast` edits the cast before rendering. Output events are screen
  deltas, so the head before the first paint (a blank window collapsed to one
  row) is **folded into one zero-interval event** instead of dropped
  (dropping it loses screen state), and only the tail after the alt-screen
  exit is dropped (opencode's exit screen, which prints the session id).
  Intervals are divided by the speed factor (1.25×, which also cuts the SVG
  size by about 30%: `terminal-record` merges frames that fall close
  together); pauses are capped by the header's `idle_time_limit`, which
  `terminal-record` honors.
- **The cursor is hidden by stripping `ESC[?25h`**: `terminal-record` always
  draws a block cursor while the terminal shows one (opencode 2.1.4 shows it
  in the composer).
- **Ready marker**: the recorder waits for `ctrl+p` from the built-in footer
  (`ctrl+p commands`). A developer `cli.json` with
  `"plugins": ["-opencode.prompt.footer"]` hides it, which is one reason the
  throw-away config drops the `plugins` list (seen on opencode 2.1.4).
- **The home screen's model comes from `model.json`, not the project config**:
  opencode's home screen shows the globally most-recent model, so a stale
  entry (e.g. a Go model from an unrelated session) silently records the wrong
  statusline. The recorder pins the take's model there for the duration of the
  take and restores the original file afterwards, and it verifies each take's
  model against the local `/api/model` catalog before recording — a provider
  the instance does not have (e.g. `kimi-code-plan-global` on a CN
  integration) fails loudly instead of falling back. Override the model in
  `record-demo.config.json` when your integration differs from the wrapper
  default; verify the model line in the frame (`Build · <model> <provider>`)
  after recording.
- The window chrome comes from `--theme`: under tmux, asciinema stores no
  terminal palette in the cast, so `auto` falls back to `terminal-record`'s
  built-in dark theme anyway (asciinema 3.2.1, tmux 3.8).
- Keep prompts short and tool-free so the turn finishes cleanly without
  permission dialogs.
