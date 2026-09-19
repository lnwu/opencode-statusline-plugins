# Changelog

**English** | [简体中文](https://github.com/lnwu/opencode-statusline-plugins/blob/main/packages/opencode-go-statusline/CHANGELOG.zh-CN.md)

## Unreleased

### Fixed

- Restore the statusline colors after OpenCode 2.0.9 renamed its resolved theme tokens.

## 1.0.1 - 2026-09-18

### Changed

- Replace the static README screenshots with animated SVG demos (English and Simplified Chinese).

## 1.0.0 - 2026-09-17

_First stable release._

## 0.3.1 - 2026-09-17

### Changed

- Refresh the README with emoji headings, a corrected `language` value table, an `opencode.jsonc` example, and demo screenshots.

## 0.3.0 - 2026-09-17

### Changed

- Publish pre-built `dist/` bundles and move shared internals into a `core` workspace package. Statusline behavior is unchanged.

## 0.2.0 - 2026-09-17

### Added

- Add a `language` option for the statusline labels: `"auto"` (default), `"en"`, `"zh-CN"` (or `"zh"`). Configure it in `opencode.json` plugin options or `cli.json`; the CLI-local value wins.
- `"auto"` reads `LC_ALL`, `LC_MESSAGES`, `LANGUAGE`, `LANG` in order: `zh*` locales show `5h / 周 / 月`, everything else shows `5h / Weekly / Monthly`.

## 0.1.7 - 2026-09-17

### Changed

- **Breaking:** Rename the plugin ids from `lnwu.*` to the package name: the server plugin and RPC are now `opencode-go-statusline`, the TUI entry is `opencode-go-statusline.tui`. Update disable patterns such as `-lnwu.*`. No persisted state to migrate.

## 0.1.6 - 2026-09-17

_Internal repackaging and dependency cleanup; no behavior changes._

## 0.1.5 - 2026-09-17

_First release from this monorepo. Packaging and repository move only; the statusline is unchanged since 0.1.4._
