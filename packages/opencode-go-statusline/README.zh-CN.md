# opencode-go-statusline

[![npm version](https://img.shields.io/npm/v/opencode-go-statusline)](https://www.npmjs.com/package/opencode-go-statusline)
[![license](https://img.shields.io/npm/l/opencode-go-statusline)](https://github.com/lnwu/opencode-statusline-plugins/blob/main/packages/opencode-go-statusline/LICENSE)

[English](https://github.com/lnwu/opencode-statusline-plugins/blob/main/packages/opencode-go-statusline/README.md) | **简体中文**

在 OpenCode TUI 底栏显示 OpenCode Go 订阅用量。

## 功能

- 在输入框底栏实时显示 **5 小时滚动 / 每周 / 每月** 用量百分比
- 展开底栏详情（或终端足够宽）时显示各窗口的重置倒计时
- 颜色提示：正常为弱化色，≥70% 变提示色，≥90% 或配额窗口状态异常时变错误色
- 仅当会话模型 provider 为 `opencode-go` 时显示
- 用量约每分钟自动刷新一次

## 环境要求

- OpenCode `>2.0.0`
- 已登录 OpenCode Go 凭据（`opencode-go`）

## 安装

```sh
opencode plugin add opencode-go-statusline
```

或在 `~/.config/opencode/opencode.json` 中添加：

```jsonc
{
  "plugins": ["opencode-go-statusline"]
}
```

## 疑难排查

- **底栏始终不显示** —— 仅当会话模型 provider 为 `opencode-go` 时才显示，请先在会话中切换到 OpenCode Go 模型。
- **只显示 `Go —` 而没有数字** —— 无法解析 `opencode-go` 凭据，或服务端插件被禁用。请检查 OpenCode Go 登录状态。

## 许可证

MIT
