# Changelog

**English** | [简体中文](https://github.com/lnwu/opencode-statusline-plugins/blob/main/packages/opencode-copilot-statusline/CHANGELOG.zh-CN.md)

## Unreleased

### Changed

- Color the `Copilot` label together with its percentage, and show `Copilot —` in the error color when the quota cannot be resolved.

## 0.1.0 - 2026-09-18

### Added

- Show the GitHub Copilot quota as a used percentage in the footer statusline (`Copilot 87%`).
- Show a monthly reset countdown when the footer details are expanded (or the terminal is wide enough).
- Read the premium-request quota for paid plans and fall back to the chat allowance on plans without one, such as Copilot Free.
- Show `Copilot ∞` for unlimited premium requests and `Copilot —` when the quota cannot be resolved.
- Only appear for sessions whose model provider is `github-copilot`, refreshing about once per minute.
