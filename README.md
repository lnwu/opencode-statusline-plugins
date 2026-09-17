# opencode-statusline-plugins

[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Monorepo of [OpenCode](https://opencode.ai) TUI plugins that show your AI subscription quota in the footer statusline.

Each plugin reads usage from credentials OpenCode already has — no cookies, no manual setup, and secrets never leave the local server.

## Plugins

| Plugin | Subscription quota | Status |
| --- | --- | --- |
| [`opencode-go-statusline`](packages/opencode-go-statusline) | OpenCode Go — rolling 5h / weekly / monthly | ✅ Available |
| [`opencode-kimi-code-statusline`](packages/opencode-kimi-code-statusline) | Kimi Code (Kimi For Coding) | 🚧 Planned |
| [`opencode-copilot-statusline`](packages/opencode-copilot-statusline) | GitHub Copilot — premium requests | 🚧 Planned |

## Install

Every plugin is a standalone npm package — install only the ones you need:

```sh
opencode plugin add opencode-go-statusline
```

See each package's README for provider-specific requirements.

## Repository layout

```
packages/
├── opencode-go-statusline/          # OpenCode Go subscription quota
├── opencode-kimi-code-statusline/   # Kimi Code subscription quota (planned)
└── opencode-copilot-statusline/     # GitHub Copilot quota (planned)
```

Shared TUI components will be extracted into a private `packages/core` workspace as more plugins land. It is bundled into each plugin at build time and never published on its own.

## Development

```sh
bun install
bun run build       # build all packages
bun run typecheck   # typecheck all packages
```

> **Note on the TUI build:** OpenCode only applies its Solid JSX transform to plugin files outside `node_modules`, so published TUI entries must ship pre-compiled JSX. Each package's `build.ts` reuses `@opentui/solid/bun-plugin` — the same transform OpenCode uses at runtime.

## License

MIT
