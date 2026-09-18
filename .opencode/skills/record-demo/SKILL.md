---
name: Record demo
description: Record or refresh the animated README demo for a statusline package — a real OpenCode TUI in a fixed-size tmux pane, recorded with terminal-svg and rendered to an SVG. Use when the user asks to record, re-record, or update the demo animation (录制 / 更新演示动图).
---

# Record the demo animation

The package READMEs show the statusline with an animated SVG recorded from a
real TUI session. `packages/core/src/record-demo.ts` (`recordDemo`) drives it:
tmux runs the real TUI inside `terminal-svg rec` at a fixed 120×28, the prompt
is typed with `tmux send-keys` so the animation shows it character by
character, and the finished cast is rendered to an SVG (with the `.cast`
master kept next to it). The take starts on opencode's home screen (logo +
composer), and the animation opens at the first paint — the blank terminal and
its collapsing window are skipped.

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

Uses the developer's own OpenCode configuration and credentials — records
whatever plugins the local configuration loads (i.e. the released versions).

Per-developer defaults live in `<package>/record-demo.config.json`
(gitignored): `{ "model": "provider/id", "prompt": "...", "cursor": "none",
"theme": "github-dark", "replyTimeout": 180000, "dir": "~/oc-demo" }`. All
fields are optional; CLI flags override the file, and invalid values fail
loudly instead of recording the wrong thing.

The recorder hides the cursor in the SVG by default (`--cursor block|bar|
underline|none`, default `none`) and pins the take's model in opencode's
global `model.json` for the duration of the take, restoring the original file
afterwards: the home screen's model — and therefore which statusline renders
— follows the globally most-recent model, not the project config.

## Prerequisites

- `opencode`, `tmux`, and `terminal-svg` on PATH
  (`brew install russmckendrick/tap/terminal-svg`)
- The package's own credential logged in locally: an OpenCode Go account for
  `opencode-go-statusline`, a GitHub Copilot account
  (`opencode auth login github-copilot`) for `opencode-copilot-statusline`
- Network access (models.dev; every take makes a real model call)

## Record

```sh
# go: local, en and zh-CN
bun run --filter opencode-go-statusline record:demo

# go: one language; custom prompt/theme
bun run --filter opencode-go-statusline record:demo -- --locale en
bun scripts/record-demo.ts --prompt "Say hi in one short sentence." --theme dracula

# copilot: single demo
bun run --filter opencode-copilot-statusline record:demo

# copilot: override the model if the default is rejected by your plan
# (Copilot Free is entitled to gpt-4o-mini-2024-07-18 only)
bun scripts/record-demo.ts --model github-copilot/gpt-4o-mini-2024-07-18
```

There is no npm key needed. Both `record:demo` scripts build `dist/` first.
For a persistent override, put it in `record-demo.config.json` instead of
passing the flag every time:

```jsonc
// packages/opencode-copilot-statusline/record-demo.config.json (gitignored)
{ "model": "github-copilot/claude-sonnet-5" }
```

- Common options (both packages): `--prompt "..."`, `--theme <terminal-svg
  theme>` (default `github-dark`), `--cursor block|bar|underline|none` (default
  `none`), `--from <seconds>` (defaults to the TUI's first paint),
  `--reply-timeout <ms>` (default `180000`), `--dir <path>` (default
  `~/oc-demo`).
- go-only: `--locale en|zh-CN|all` (default `all`); `--prompt` overrides both
  locales' default (en `Reply with exactly: ok`, zh-CN `请只回复：ok`).
- copilot-only: `--model <provider/id>` (default `github-copilot/gpt-5-mini`);
  default prompt is `Reply with exactly: ok`.
- Outputs (repo-only; `files: ["dist"]` keeps them out of the npm tarball):
  - go: `assets/demo.en.svg`, `assets/demo.zh-CN.svg` (+ matching `.cast`)
  - copilot: `assets/demo.svg` (+ `assets/demo.cast`)

## Verify

- Open the SVG in a **browser** — Quick Look ignores the embedded fonts.
- Check the window title (`opencode`, not the session id), the opening frame
  (home screen with the logo), the prompt typing, the finished reply, and the
  footer quota (go: `Go 5h … · Weekly … · Monthly …`, `周` / `月` for zh-CN;
  copilot: `Copilot NN% (…)`). Confirm the model line matches the take's model
  and that no cursor block is rendered, and grep the SVG for `U+FFFD` (a
  corrupted glyph would show as a stray `?`).
- Eyeball for secrets and personal paths; the prompt and the model's reply are
  recorded verbatim. The real local configuration is used — only the session
  and its project directory are throw-away.
- Re-render from the master without re-recording:
  `terminal-svg assets/demo.en.cast --theme nord -o /tmp/demo.svg` (go) or
  `terminal-svg assets/demo.cast --theme nord -o /tmp/demo.svg` (copilot).

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

- **Dark themes only** for assets whose content paints its own dark
  background. Light themes (`--theme-light github-light`) expose hairline
  seams between the tiled background rects (upstream:
  russmckendrick/terminal-svg#3) because the content background contrasts with
  the theme's window background.
- `terminal-svg rec` has no `--timeout`; the take ends when the recorded
  command exits — the recorder sends `Escape` + `ctrl+c` to quit the TUI.
- Never trim the head with `terminal-svg edit --cut`: the remaining events are
  screen deltas and cannot rebuild state (black holes). Trim at render time
  with `--from` / `--to`; the recorder opens the animation at the TUI's first
  paint (home screen) and cuts at the alt-screen exit, so it neither starts on
  a blank, collapsing window nor ends on opencode's exit frame.
- `rec` titles the cast with the recorded command (session id included); the
  recorder rewrites the header title and passes `--title opencode`.
- **The home screen's model comes from `model.json`, not the project config**:
  opencode's home screen shows the globally most-recent model, so a stale
  entry (e.g. a Go model from an unrelated session) silently records the wrong
  statusline. The recorder pins the take's model there for the duration of the
  take and restores the original file afterwards; verify the model line in the
  frame (`Build · <model> <provider>`) after recording.
- The cursor is hidden by default (`--cursor none`); pass `--cursor block` to
  record it.
- **terminal-svg corrupts multi-byte glyphs at its 1024-byte read boundary**
  (upstream: russmckendrick/terminal-svg#4): its PTY reader decodes each read
  as UTF-8 independently, so a block glyph split across the boundary becomes
  `U+FFFD` plus a stray continuation byte — visible as a `?`-looking cell in
  the logo. The recorder repairs the cast after recording (`repairCast`,
  warned in the log); remove the repair once the upstream fix lands. Re-check
  the logo after re-recording and report upstream if it ever changes shape.
- `--no-embed-source` is deliberate: the SVG does not carry the cast in its
  `<metadata>`; the `.cast` master is committed next to it.
- Keep prompts short and tool-free so the turn finishes cleanly without
  permission dialogs.
