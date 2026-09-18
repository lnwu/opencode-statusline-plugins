# 变更日志

[English](https://github.com/lnwu/opencode-statusline-plugins/blob/main/packages/opencode-copilot-statusline/CHANGELOG.md) | **简体中文**

## Unreleased

_暂无变更。_

## 0.1.0 - 2026-09-18

### 新增

- 在底栏以已用百分比显示 GitHub Copilot 配额（`Copilot 87%`）。
- 展开底栏详情（或终端足够宽）时显示每月重置倒计时。
- 付费计划读取 premium requests 配额；没有该配额的计划（如 Copilot Free）回退到 chat 额度。
- premium requests 无限时显示 `Copilot ∞`，无法解析配额时显示 `Copilot —`。
- 仅当会话模型 provider 为 `github-copilot` 时显示，用量约每分钟刷新一次。
