# AGENTS.md

Bun-workspace monorepo of OpenCode V2 TUI plugins (footer statusline quota).
Only `packages/opencode-go-statusline` is implemented; kimi-code and copilot
are README-only placeholders.

## Commands

- `bun install` — lockfile is `bun.lock`; use Bun, not npm/pnpm.
- `bun run build` / `bun run typecheck` — all packages; root scripts use
  `--if-present`, so README-only packages are skipped.
- Single package: `bun run --filter opencode-go-statusline build`.
- No tests exist; verify with build + typecheck.

## Conventions

- When planning any change, consider whether this file needs an update (new
  commands, package layout, release process) and include it in the same change.

## Release

- A published GitHub release tagged `<package>@<version>` triggers
  `publish.yml`; the tag must match that package's `package.json`. It runs
  build + typecheck, then publishes via npm OIDC trusted publishing. Don't run
  `npm publish` locally.

## Docs

- Update `README.md` and `README.zh-CN.md` together (root and package) when
  behavior or plugin status changes.
- Check the V2 plugin docs (https://opencode.ai/v2/docs/build/plugins) or the
  `opencode` skill before changing plugin API usage.
