# opencode-copilot-statusline

> 🚧 **Planned — not implemented yet.**

OpenCode TUI plugin that displays your **GitHub Copilot** premium request quota in the footer statusline.

## Planned behavior

- Appears only for sessions whose model provider is GitHub Copilot
- Shows premium requests used / remaining and the quota reset date
- Color thresholds consistent with the other plugins in this repo

## Planned requirements

- OpenCode `>2.0.0`
- A GitHub Copilot subscription with credentials available locally (GitHub CLI / Copilot auth)

## Status

- [ ] Research credential source
- [ ] Research usage endpoint
- [ ] Implement server plugin (`src/index.ts`, RPC)
- [ ] Implement TUI entry (`src/tui.tsx`)

npm package name reserved for release: `opencode-copilot-statusline`

Part of [opencode-statusline-plugins](../../README.md).
