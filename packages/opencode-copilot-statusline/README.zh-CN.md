# 📊 opencode-copilot-statusline

[![npm version](https://img.shields.io/npm/v/opencode-copilot-statusline)](https://www.npmjs.com/package/opencode-copilot-statusline)
[![license](https://img.shields.io/npm/l/opencode-copilot-statusline)](https://github.com/lnwu/opencode-statusline-plugins/blob/main/packages/opencode-copilot-statusline/LICENSE)

[English](https://github.com/lnwu/opencode-statusline-plugins/blob/main/packages/opencode-copilot-statusline/README.md) | **简体中文**

在 OpenCode TUI 底栏显示 GitHub Copilot 配额用量。

## ✨ 功能

- 在输入框底栏实时显示配额已用百分比（`Copilot 87%`）
- 展开底栏详情（或终端足够宽）时显示每月重置倒计时
- 颜色提示：正常为弱化色，≥70% 变提示色，≥90% 变错误色
- 仅当会话模型 provider 为 `github-copilot` 时显示
- 用量约每分钟自动刷新一次

## 📋 环境要求

- OpenCode@2
- 已在 OpenCode 登录 GitHub Copilot（`opencode auth login github-copilot`）

## 🚀 安装

```sh
opencode plugin add opencode-copilot-statusline
```

## 📈 百分比的含义

状态栏会自动选取限制你当前计划的配额：

| 计划                                        | 来源                          | 示例          |
| ------------------------------------------- | ----------------------------- | ------------- |
| Pro / Business / Enterprise                 | 本月已用的 **premium requests** | `Copilot 87%` |
| Copilot Free（没有 premium requests 配额）  | **chat** 额度                  | `Copilot 6%`  |
| premium requests 无限                       | 没有有限配额                   | `Copilot ∞`   |
| 未登录、凭证无法解析、接口异常              | 无数据                         | `Copilot —`   |

倒计时指向每月配额重置日期。

## 🩺 疑难排查

- **底栏始终不显示** —— 仅当会话模型 provider 为 `github-copilot` 时才显示，请先在会话中切换到 GitHub Copilot 模型。
- **只显示 `Copilot —` 而没有数字** —— 无法解析 `github-copilot` 凭据。请运行 `opencode auth login github-copilot`，然后确认插件已重新启用。
- **显示 `Copilot ∞`** —— 你的计划没有有限的 premium requests 上限。

## 📜 变更日志

完整发布历史见 [Releases](https://github.com/lnwu/opencode-statusline-plugins/releases)。

## 📄 许可证

MIT
