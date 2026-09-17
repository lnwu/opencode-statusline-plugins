# opencode-kimi-code-statusline

> 🚧 **Planned — not implemented yet.**

OpenCode TUI plugin that displays your **Kimi Code** (Kimi For Coding) subscription quota in the footer statusline.

## Planned behavior

- Appears only for sessions whose model provider is Kimi
- Shows the 5-hour rolling window and weekly quota percentages
- Reset countdowns when the footer details are expanded (or the terminal is wide enough)
- Color thresholds consistent with the other plugins in this repo

## Planned requirements

- OpenCode `>2.0.0`
- An active Kimi Code subscription with credentials available locally

## Status

- [ ] Research credential source (Kimi CLI / OAuth token)
- [ ] Research usage endpoint
- [ ] Implement server plugin (`src/index.ts`, RPC)
- [ ] Implement TUI entry (`src/tui.tsx`)

npm package name reserved for release: `opencode-kimi-code-statusline`

Part of [opencode-statusline-plugins](../../README.md).
