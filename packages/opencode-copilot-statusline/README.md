# 📊 opencode-copilot-statusline

[![npm version](https://img.shields.io/npm/v/opencode-copilot-statusline)](https://www.npmjs.com/package/opencode-copilot-statusline)
[![license](https://img.shields.io/npm/l/opencode-copilot-statusline)](https://github.com/lnwu/opencode-statusline-plugins/blob/main/packages/opencode-copilot-statusline/LICENSE)

**English** | [简体中文](https://github.com/lnwu/opencode-statusline-plugins/blob/main/packages/opencode-copilot-statusline/README.zh-CN.md)

Display your GitHub Copilot quota in the OpenCode TUI footer statusline.

![Animated demo: GitHub Copilot quota in the footer statusline](./assets/demo.svg)

## ✨ Features

- Live used-quota percentage in the prompt footer (`Copilot 87%`)
- Monthly reset countdown on terminals 120 columns or wider; below 80 columns the account label is dropped
- Color feedback on the whole segment (label and percentage): subdued normally, warning at ≥70%, error at ≥90% or when the quota cannot be resolved
- When more than one GitHub Copilot login carries an OpenCode credential label, shows the active login's label, first letter capitalized and cut to 16 characters (`Copilot · Work 87%`)
- Only appears for sessions whose model provider is `github-copilot`
- Usage refreshes about once per minute

## 📋 Requirements

- OpenCode newer than 2.0.0
- A GitHub Copilot account (any plan, including Copilot Free) logged in to OpenCode (`opencode auth login github-copilot`)

## 🚀 Install

```sh
opencode plugin add opencode-copilot-statusline
```

## 📈 What the percentage means

The statusline shows premium requests; plans without a premium-request quota fall back to the chat allowance:

| Case                                                                                                                                     | Source                               | Example       |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------- |
| Plans with a premium-request quota                                                                                                       | **premium requests** used this month | `Copilot 87%` |
| Copilot Free (no premium-request quota)                                                                                                  | **chat** allowance                   | `Copilot 6%`  |
| Displayed quota reported as unlimited                                                                                                    | no finite quota                      | `Copilot ∞`   |
| No successful fetch yet: first fetch running, not signed in, credential unresolvable or rejected, API unreachable or unexpected response | no data                              | `Copilot —`   |

The countdown targets the monthly quota reset date. After one successful fetch, the statusline keeps the last values when a later fetch fails.

## 🩺 Troubleshooting

- **The statusline never shows up** — it is hidden unless the session's model provider is `github-copilot`. Switch to a GitHub Copilot model in the session.
- **It shows `Copilot —` instead of numbers** — no quota fetch has succeeded yet: the first fetch is still running, the `github-copilot` credential could not be resolved or was rejected, the API could not be reached or returned an unexpected response, or the server plugin is not loaded. Run `opencode auth login github-copilot` and wait up to a minute for the next refresh. If it persists, check that `opencode-copilot-statusline` is still listed under `plugins` in the OpenCode config (`opencode.json` or `opencode.jsonc`).
- **It shows `Copilot ∞`** — your plan reports the displayed quota (premium requests, or chat when there is no premium-request quota) as unlimited.

## 📜 Changelog

See [CHANGELOG.md](https://github.com/lnwu/opencode-statusline-plugins/blob/main/packages/opencode-copilot-statusline/CHANGELOG.md) for the release history.

## 📄 License

MIT
