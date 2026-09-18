# 📊 opencode-copilot-statusline

[![npm version](https://img.shields.io/npm/v/opencode-copilot-statusline)](https://www.npmjs.com/package/opencode-copilot-statusline)
[![license](https://img.shields.io/npm/l/opencode-copilot-statusline)](https://github.com/lnwu/opencode-statusline-plugins/blob/main/packages/opencode-copilot-statusline/LICENSE)

**English** | [简体中文](https://github.com/lnwu/opencode-statusline-plugins/blob/main/packages/opencode-copilot-statusline/README.zh-CN.md)

Display your GitHub Copilot quota in the OpenCode TUI footer statusline.

## ✨ Features

- Live used-quota percentage in the prompt footer (`Copilot 87%`)
- Monthly reset countdown when the footer details are expanded (or the terminal is wide enough)
- Color feedback: subdued normally, info at ≥70%, error at ≥90%
- Only appears for sessions whose model provider is `github-copilot`
- Usage refreshes about once per minute

## 📋 Requirements

- OpenCode@2
- A GitHub Copilot subscription connected to OpenCode (`opencode auth login github-copilot`)

## 🚀 Install

```sh
opencode plugin add opencode-copilot-statusline
```

## 📈 What the percentage means

The statusline picks the quota window that limits your plan:

| Plan                                             | Source                                                 | Example        |
| ------------------------------------------------ | ------------------------------------------------------ | -------------- |
| Pro / Business / Enterprise                      | **premium requests** used this month                   | `Copilot 87%`  |
| Copilot Free (no premium-request quota)          | **chat** allowance                                     | `Copilot 6%`   |
| Unlimited premium requests                       | no finite quota                                        | `Copilot ∞`    |
| Not signed in, credential unresolvable, API down | no data                                                | `Copilot —`    |

The countdown targets the monthly quota reset date.

## 🩺 Troubleshooting

- **The statusline never shows up** — it is hidden unless the session's model provider is `github-copilot`. Switch to a GitHub Copilot model in the session.
- **It shows `Copilot —` instead of numbers** — the `github-copilot` credential could not be resolved. Run `opencode auth login github-copilot`, then check the plugin is enabled again.
- **It shows `Copilot ∞`** — your plan reports no finite premium-request limit.

## 📜 Changelog

See the [releases](https://github.com/lnwu/opencode-statusline-plugins/releases) for the release history.

## 📄 License

MIT
