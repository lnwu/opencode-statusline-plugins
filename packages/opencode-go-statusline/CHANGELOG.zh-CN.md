# 变更日志

[English](https://github.com/lnwu/opencode-statusline-plugins/blob/main/packages/opencode-go-statusline/CHANGELOG.md) | **简体中文**

## Unreleased

### 变更

- 改为发布预构建的 `dist/` 产物，共享实现迁移到 `core` workspace 包。状态栏行为无变化。

## 0.2.0 - 2026-09-17

### 新增

- 状态栏标签新增 `language` 选项：`"auto"`（默认）、`"en"`、`"zh-CN"`（或 `"zh"`）。可在 `opencode.json` 插件选项或 `cli.json` 中配置，CLI 本地值优先。
- `"auto"` 依次读取 `LC_ALL`、`LC_MESSAGES`、`LANGUAGE`、`LANG`：`zh*` 语言环境显示 `5h / 周 / 月`，其余显示 `5h / Weekly / Monthly`。

## 0.1.7 - 2026-09-17

### 变更

- **Breaking:** 插件 id 由 `lnwu.*` 改为包名：服务端插件与 RPC 现在是 `opencode-go-statusline`，TUI 入口是 `opencode-go-statusline.tui`。用过 `-lnwu.*` 之类禁用规则的需同步更新。不涉及持久化状态迁移。

## 0.1.6 - 2026-09-17

_内部重新打包并清理依赖，无行为变更。_

## 0.1.5 - 2026-09-17

_本 monorepo 的首次发布。仅打包与仓库迁移，状态栏自 0.1.4 起未变。_
