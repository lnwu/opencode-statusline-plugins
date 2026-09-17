# 📊 opencode-go-statusline

[![npm version](https://img.shields.io/npm/v/opencode-go-statusline)](https://www.npmjs.com/package/opencode-go-statusline)
[![license](https://img.shields.io/npm/l/opencode-go-statusline)](https://github.com/lnwu/opencode-statusline-plugins/blob/main/packages/opencode-go-statusline/LICENSE)

[English](https://github.com/lnwu/opencode-statusline-plugins/blob/main/packages/opencode-go-statusline/README.md) | **简体中文**

在 OpenCode TUI 底栏显示 OpenCode Go 订阅用量。

## ✨ 功能

- 在输入框底栏实时显示 **5 小时滚动 / 每周 / 每月** 用量百分比
- 展开底栏详情（或终端足够宽）时显示各窗口的重置倒计时
- 颜色提示：正常为弱化色，≥70% 变提示色，≥90% 或配额窗口状态异常时变错误色
- 仅当会话模型 provider 为 `opencode-go` 时显示
- 用量约每分钟自动刷新一次
- 标签跟随终端语言（`5h / 周 / 月` 或 `5h / Weekly / Monthly`），可用 `language` 选项覆盖

## 📋 环境要求

- OpenCode@2
- 已登录 OpenCode Go（`opencode-go` 凭据）

## 🚀 安装

```sh
opencode plugin add opencode-go-statusline
```

## 🌐 语言

底栏标签默认跟随终端语言环境：`zh*` 显示 `5h / 周 / 月`，其他显示
`5h / Weekly / Monthly`。

可在 `language` 选项中覆盖：

```jsonc title="~/.config/opencode/opencode.jsonc"
{
  "plugins": [
    { "package": "opencode-go-statusline", "options": { "language": "zh-CN" } },
  ],
}
```

| 取值               | 显示                                                    |
| ------------------ | ------------------------------------------------------- |
| `"auto"`（默认）   | 按 `LC_ALL`、`LC_MESSAGES`、`LANGUAGE`、`LANG` 自动判断 |
| `"en"`             | `5h / Weekly / Monthly`                                 |
| `"zh-CN"` / `"zh"` | `5h / 周 / 月`                                          |

## 🩺 疑难排查

- **底栏始终不显示** —— 仅当会话模型 provider 为 `opencode-go` 时才显示，请先在会话中切换到 OpenCode Go 模型。
- **只显示 `Go —` 而没有数字** —— 无法解析 `opencode-go` 凭据，或服务端插件被禁用。请检查 OpenCode Go 登录状态。

## 📜 变更日志

完整发布历史见 [CHANGELOG.zh-CN.md](https://github.com/lnwu/opencode-statusline-plugins/blob/main/packages/opencode-go-statusline/CHANGELOG.zh-CN.md)。

## 📄 许可证

MIT
