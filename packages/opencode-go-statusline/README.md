# opencode-go-statusline

[![npm version](https://img.shields.io/npm/v/opencode-go-statusline)](https://www.npmjs.com/package/opencode-go-statusline)
[![license](https://img.shields.io/npm/l/opencode-go-statusline)](https://github.com/lnwu/opencode-statusline-plugins/blob/main/packages/opencode-go-statusline/LICENSE)

**English** | [简体中文](https://github.com/lnwu/opencode-statusline-plugins/blob/main/packages/opencode-go-statusline/README.zh-CN.md)

Display your OpenCode Go subscription quota in the TUI footer statusline.

## Features

- Live **rolling 5h / weekly / monthly** usage percentages in the prompt footer
- Reset countdowns when footer details are expanded (or the terminal is wide enough)
- Color feedback: subdued normally, info at ≥70%, error at ≥90% or when a quota window reports a non-`ok` status
- Only appears for sessions whose model provider is `opencode-go`

## Why this one

- **V2-native** — built on the OpenCode V2 plugin API (`Plugin.define`, RPC, integration credentials)
- **Zero config** — no cookies, no workspace IDs, nothing to paste: the server plugin resolves the `opencode-go` credential through the official integration API
- **Secrets stay local** — the API key never leaves the server process; the TUI only talks to the local server over RPC
- **Tiny** — no runtime dependencies beyond the official plugin API

## Requirements

- OpenCode **v2.0.4 or newer**
- An active OpenCode Go credential (`opencode-go`)

## Install

```sh
opencode plugin add opencode-go-statusline
```

Or add it to your `~/.config/opencode/opencode.json`:

```jsonc
{
  "plugins": ["opencode-go-statusline"]
}
```

## How it works

The package contains two entries:

| Entry | Role |
| --- | --- |
| `index.ts` | Server plugin. Resolves the `opencode-go` credential via `ctx.integration.connection.active("opencode-go")` + `resolve()`, fetches the usage endpoint, and exposes it over RPC (`ctx.rpc.register`). |
| `dist/tui.js` | TUI plugin (compiled from `tui.tsx`). Polls the RPC every 60s and renders the footer statusline for `opencode-go` sessions. |

## Behavior notes

- On a remote server (or when the server plugin is disabled) the footer shows `Go —` instead of numbers.
- Usage is fetched at most once per minute per connected TUI.

## Development

```sh
bun install
bun run build     # compiles tui.tsx -> dist/tui.js
bun run typecheck
```

> **Why is the TUI entry pre-compiled?** OpenCode applies its Solid JSX transform
> (`babel-preset-solid`, universal output) only to plugin files outside
> `node_modules`. An npm package always lives under `node_modules`, so it must
> ship JSX that is already compiled with that transform — otherwise reactive
> props lose their getters and the footer paints once and never updates. The
> build reuses `@opentui/solid/bun-plugin`, the same transform OpenCode uses at
> runtime.

## License

MIT
