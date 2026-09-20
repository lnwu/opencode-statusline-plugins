# Changelog

**English** | [简体中文](https://github.com/lnwu/opencode-statusline-plugins/blob/main/packages/opencode-copilot-statusline/CHANGELOG.zh-CN.md)

## Unreleased

### Changed

- Color the ≥70% quota band with the warning token instead of info.
- Cache quota lookups briefly so several TUI clients share one upstream request.

## 1.0.2 - 2026-09-19

### Changed

- Re-record the README demo animation.

## 1.0.1 - 2026-09-19

### Fixed

- Restore the statusline colors after OpenCode 2.0.9 renamed its resolved theme tokens.

## 1.0.0 - 2026-09-18

### Added

- Add an animated README demo of the footer statusline.

## 0.2.0 - 2026-09-18

### Changed

- Color the `Copilot` label together with its percentage, and show `Copilot —` in the error color when the quota cannot be resolved.

## 0.1.0 - 2026-09-18

### Added

- Show the GitHub Copilot quota as a used percentage in the footer statusline (`Copilot 87%`).
- Show a monthly reset countdown when the footer details are expanded (or the terminal is wide enough).
- Read the premium-request quota for paid plans and fall back to the chat allowance on plans without one, such as Copilot Free.
- Show `Copilot ∞` for unlimited premium requests and `Copilot —` when the quota cannot be resolved.
- Only appear for sessions whose model provider is `github-copilot`, refreshing about once per minute.
