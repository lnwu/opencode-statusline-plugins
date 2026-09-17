# opencode-statusline-plugins

[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[English](README.md) | **简体中文**

一组 [OpenCode](https://opencode.ai) TUI 插件：在底部状态栏显示你的 AI 订阅配额。

每个插件都直接读取 OpenCode 已有的凭证 —— 不需要 cookie，不需要手动配置，密钥不会离开本地服务进程。

## 插件列表

| 插件 | 订阅配额 | 状态 |
| --- | --- | --- |
| [`opencode-go-statusline`](packages/opencode-go-statusline) | OpenCode Go —— 滚动 5h / 周 / 月 | ✅ 可用 |
| [`opencode-kimi-code-statusline`](packages/opencode-kimi-code-statusline) | Kimi Code（Kimi For Coding） | 🚧 计划中 |
| [`opencode-copilot-statusline`](packages/opencode-copilot-statusline) | GitHub Copilot —— premium requests | 🚧 计划中 |

## 安装

每个插件都是独立的 npm 包，按需安装：

```sh
opencode plugin add opencode-go-statusline
```

各 provider 的具体要求见对应包的 README。

## 仓库结构

```
packages/
├── opencode-go-statusline/          # OpenCode Go 订阅配额
├── opencode-kimi-code-statusline/   # Kimi Code 订阅配额（计划中）
└── opencode-copilot-statusline/     # GitHub Copilot 配额（计划中）
```

共享的 TUI 组件后续会抽到私有的 `packages/core` workspace（构建时内联进各插件，不单独发布）。

## 开发

```sh
bun install
bun run build       # 构建所有包
bun run typecheck   # 类型检查
```

> **关于 TUI 预编译**：OpenCode 只对 `node_modules` 之外的插件文件应用 Solid JSX transform，
> 因此发布到 npm 的 TUI 入口必须预先编译。各包的 `build.ts` 复用 `@opentui/solid/bun-plugin`，
> 与 OpenCode 运行时使用的是同一个 transform。

## License

MIT
