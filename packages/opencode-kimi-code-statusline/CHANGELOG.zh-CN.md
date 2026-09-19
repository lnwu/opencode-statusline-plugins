# 变更日志

[English](https://github.com/lnwu/opencode-statusline-plugins/blob/main/packages/opencode-kimi-code-statusline/CHANGELOG.md) | **简体中文**

## Unreleased

_暂无变更。_

## 0.1.0 - 2026-09-19

### 新增

- 在输入框底栏显示 Kimi For Coding 滚动 5 小时与每周配额的已用百分比（`Kimi 5h 63% · Weekly 18%`）。
- 展开底栏详情（或终端足够宽）时显示各窗口的重置倒计时。
- 无法解析配额时显示 `Kimi —`。
- 仅当会话模型 provider 为 Kimi For Coding 套餐（`kimi-code-plan-global` 或 `kimi-code-plan-cn`）时显示，用量约每分钟自动刷新一次。
- 通过 `language` 选项本地化窗口标签（`5h / Weekly` 或 `5h / 周`）。
