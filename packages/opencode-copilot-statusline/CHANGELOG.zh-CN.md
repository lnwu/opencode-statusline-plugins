# 变更日志

[English](https://github.com/lnwu/opencode-statusline-plugins/blob/main/packages/opencode-copilot-statusline/CHANGELOG.md) | **简体中文**

## Unreleased

_暂无变更。_

## 1.0.2 - 2026-09-19

### 变更

- 重新录制 README 演示动画。

## 1.0.1 - 2026-09-19

### 修复

- 在 OpenCode 2.0.9 重命名主题 token 后恢复状态栏的颜色显示。

## 1.0.0 - 2026-09-18

### 新增

- README 新增底栏状态的动图演示。

## 0.2.0 - 2026-09-18

### 变更

- `Copilot` 标签与百分比整段同步变色；无法解析配额时 `Copilot —` 以错误色显示。

## 0.1.0 - 2026-09-18

### 新增

- 在底栏以已用百分比显示 GitHub Copilot 配额（`Copilot 87%`）。
- 展开底栏详情（或终端足够宽）时显示每月重置倒计时。
- 付费计划读取 premium requests 配额；没有该配额的计划（如 Copilot Free）回退到 chat 额度。
- premium requests 无限时显示 `Copilot ∞`，无法解析配额时显示 `Copilot —`。
- 仅当会话模型 provider 为 `github-copilot` 时显示，用量约每分钟刷新一次。
