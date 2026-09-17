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

## 与同类插件的区别

- **V2 原生**：基于 OpenCode V2 插件 API（`Plugin.define`、RPC、integration 凭据）
- **零配置**：不需要手动粘贴 cookie 或 workspace ID，服务端插件通过官方 integration API 解析 `opencode-go` 凭据
- **密钥不出本机**：API key 只在服务端进程中使用，TUI 仅通过 RPC 与本地服务通信
- **轻量**：除官方插件 API 外无运行时依赖

## 环境要求

- OpenCode **v2.0.4 或更新版本**
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

## 工作原理

包内包含两个入口：

| 入口 | 作用 |
| --- | --- |
| `index.ts` | 服务端插件：通过 `ctx.integration.connection.active("opencode-go")` + `resolve()` 解析凭据，请求用量接口，并通过 RPC（`ctx.rpc.register`）暴露数据。 |
| `dist/tui.js` | TUI 插件（由 `tui.tsx` 编译而来）：每 60 秒轮询 RPC，为 `opencode-go` 会话渲染底栏状态行。 |

## 行为说明

- 连接远程服务端（或服务端插件被禁用）时，底栏显示 `Go —` 而非具体数字。
- 每个已连接的 TUI 每分钟最多请求一次用量数据。

## 开发

```sh
bun install
bun run build     # 编译 tui.tsx -> dist/tui.js
bun run typecheck
```

> **为什么 TUI 入口要预编译？** OpenCode 只对 `node_modules` 之外的插件文件应用
> Solid JSX 转换（`babel-preset-solid`，universal 输出）。npm 包必然位于
> `node_modules` 下，因此必须发布**已经过该转换编译**的 JSX——否则响应式属性会
> 丢失 getter，底栏只渲染一次、之后不再更新。构建脚本复用
> `@opentui/solid/bun-plugin`，即 OpenCode 运行时使用的同一个转换。

## 许可证

MIT
