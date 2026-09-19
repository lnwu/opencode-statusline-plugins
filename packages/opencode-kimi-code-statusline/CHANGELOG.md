# Changelog

**English** | [简体中文](https://github.com/lnwu/opencode-statusline-plugins/blob/main/packages/opencode-kimi-code-statusline/CHANGELOG.zh-CN.md)

## Unreleased

_None yet._

## 0.1.0 - 2026-09-19

### Added

- Show the Kimi For Coding rolling 5-hour and weekly quota as used percentages in the footer statusline (`Kimi 5h 63% · Weekly 18%`).
- Show per-window reset countdowns when the footer details are expanded (or the terminal is wide enough).
- Show `Kimi —` when the quota cannot be resolved.
- Only appear for sessions whose model provider is a Kimi For Coding plan (`kimi-code-plan-global` or `kimi-code-plan-cn`), refreshing about once per minute.
- Localize the window labels with the `language` option (`5h / Weekly` or `5h / 周`).
