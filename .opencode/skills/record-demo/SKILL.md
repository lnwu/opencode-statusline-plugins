---
name: Record demo
description: Record or refresh the animated README demo for a statusline package — a real OpenCode TUI in a fixed-size tmux pane, recorded with terminal-svg and rendered to an SVG. Use when the user asks to record, re-record, or update the demo animation (录制 / 更新演示动图).
---

# Record the demo animation

The package READMEs show the statusline with an animated SVG recorded from a
real TUI session. `packages/opencode-go-statusline/scripts/record-demo.ts`
produces it: tmux runs the real TUI inside `terminal-svg rec` at a fixed
120×28, the prompt is typed with `tmux send-keys` so the animation shows it
character by character, and the finished cast is rendered to an SVG (with the
`.cast` master kept next to it). The take starts on opencode's home screen
(logo + composer), and the animation opens at the first paint — the blank
terminal and its collapsing window are skipped.

Two modes:

- **Local (default)** — uses the developer's own OpenCode configuration and
  credentials. The take runs in a throw-away project directory (default
  `~/oc-demo`, deleted before and after) and records whatever plugins the
  local configuration loads, i.e. the released versions. The session is
  created by the first prompt; every throw-away session is deleted on
  cleanup.
- **`--isolated`** — clean-room take from `OPENCODE_API_KEY` via the `core`
  harness (isolated HOME/XDG root, own service port, sidebar hidden). Use it
  to record the working tree's built `dist/` entries (e.g. in CI) or when the
  local configuration must not be touched.

## Prerequisites

- `opencode`, `tmux`, and `terminal-svg` on PATH
  (`brew install russmckendrick/tap/terminal-svg`)
- `--isolated` additionally needs `OPENCODE_API_KEY` (the Go credential; the
  CI secret name) and the built `dist/` entries
- Network access (models.dev; every take makes a real model call)

## Record

```sh
# Local: en and zh-CN
bun run --filter opencode-go-statusline record:demo

# One language; custom prompt/theme
bun run --filter opencode-go-statusline record:demo -- --locale en
bun scripts/record-demo.ts --prompt "Say hi in one short sentence." --theme dracula

# Clean-room, working tree
OPENCODE_API_KEY=sk-... bun scripts/record-demo.ts --isolated
```

There is no npm key needed for the local mode. The `record:demo` script builds
`dist/` first.

- Options: `--locale en|zh-CN|all` (default `all`), `--prompt "..."` (one
  prompt for both), `--theme <terminal-svg theme>` (default `github-dark`),
  `--from <seconds>` (defaults to the TUI's first paint), `--reply-timeout
  <ms>`, `--isolated`, `--dir <path>`. Default prompts: en
  `Reply with exactly: ok`, zh-CN `请只回复：ok`.
- Outputs (repo-only; `files: ["dist"]` keeps them out of the npm tarball):
  - `assets/demo.en.svg`, `assets/demo.zh-CN.svg` — animated images
  - `assets/demo.en.cast`, `assets/demo.zh-CN.cast` — asciicast masters

## Verify

- Open the SVG in a **browser** — Quick Look ignores the embedded fonts.
- Check the window title (`opencode`, not the session id), the opening frame
  (home screen with the logo), the prompt typing, the finished reply, and the
  footer quota (`Go 5h … · Weekly … · Monthly …`; `周` / `月` for zh-CN).
- Eyeball for secrets and personal paths; the prompt and the model's reply are
  recorded verbatim. Local mode uses the real configuration — only the session
  and its project directory are throw-away.
- Re-render from the master without re-recording:
  `terminal-svg assets/demo.en.cast --theme nord -o /tmp/demo.svg`.

## Use in the README

- Adding or updating a README image is user-visible: land bilingual changelog
  entries in the same PR (`AGENTS.md` → Conventions).
- Reference assets by relative path (`./assets/demo.en.svg`); npm resolves
  relative asset paths for the package page.
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
  command exits — the script sends `Escape` + `ctrl+c` to quit the TUI.
- Never trim the head with `terminal-svg edit --cut`: the remaining events are
  screen deltas and cannot rebuild state (black holes). Trim at render time
  with `--from` / `--to`; the script opens the animation at the TUI's first
  paint (home screen) and cuts at the alt-screen exit, so it neither starts on
  a blank, collapsing window nor ends on opencode's exit frame.
- `rec` titles the cast with the recorded command (session id included); the
  script rewrites the header title and passes `--title opencode`.
- `--no-embed-source` is deliberate: the SVG does not carry the cast in its
  `<metadata>`; the `.cast` master is committed next to it.
- Keep prompts short and tool-free so the turn finishes cleanly without
  permission dialogs.
