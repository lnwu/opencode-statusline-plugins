# 📊 opencode-kimi-code-statusline

[![npm version](https://img.shields.io/npm/v/opencode-kimi-code-statusline)](https://www.npmjs.com/package/opencode-kimi-code-statusline)
[![license](https://img.shields.io/npm/l/opencode-kimi-code-statusline)](https://github.com/lnwu/opencode-statusline-plugins/blob/main/packages/opencode-kimi-code-statusline/LICENSE)

**English** | [简体中文](https://github.com/lnwu/opencode-statusline-plugins/blob/main/packages/opencode-kimi-code-statusline/README.zh-CN.md)

Display your Kimi For Coding (Kimi Code) subscription quota in the OpenCode TUI footer statusline.

## ✨ Features

- Live **rolling 5h / weekly** usage percentages in the prompt footer (`Kimi 5h 63% · Weekly 18%`)
- Reset countdowns when the footer details are expanded (or the terminal is wide enough)
- Color feedback on each segment: subdued normally, info at ≥70%, error at ≥90%
- Only appears for sessions whose model provider is `kimi-code-plan-global` or `kimi-code-plan-cn`
- Usage refreshes about once per minute
- Labels follow your terminal locale (`5h / Weekly` or `5h / 周`), overridable with the `language` option

## 📋 Requirements

- OpenCode@2
- An active Kimi For Coding subscription connected to OpenCode (`opencode auth login kimi-code-plan-global`, or `kimi-code-plan-cn` for the kimi.com plan)

## 🚀 Install

```sh
opencode plugin add opencode-kimi-code-statusline
```

## 🌐 Language

Labels follow your terminal locale by default: `zh*` locales show `5h / 周`, everything else shows `5h / Weekly`.

Override it with the plugin's `language` option:

```jsonc title="~/.config/opencode/opencode.jsonc"
{
  "plugins": [
    { "package": "opencode-kimi-code-statusline", "options": { "language": "zh-CN" } },
  ],
}
```

| Value              | Display                                                 |
| ------------------ | ------------------------------------------------------- |
| `"auto"` (default) | Detect from `LC_ALL`, `LC_MESSAGES`, `LANGUAGE`, `LANG` |
| `"en"`             | `5h / Weekly`                                           |
| `"zh-CN"` / `"zh"` | `5h / 周`                                               |

## 📈 What the percentages mean

| Window                                            | Source               | Example                    |
| ------------------------------------------------- | -------------------- | -------------------------- |
| Rolling 5-hour                                    | 5-hour rolling quota | `Kimi 5h 63%`              |
| Weekly                                            | 7-day quota          | `Kimi 5h 63% · Weekly 18%` |
| Not signed in, credential unresolvable, API down  | no data              | `Kimi —`                   |

Both percentages are **used** percentages of their own window, and each countdown targets that window's reset time.

## 🩺 Troubleshooting

- **The statusline never shows up** — it is hidden unless the session's model provider is `kimi-code-plan-global` or `kimi-code-plan-cn`. Switch to a Kimi For Coding model in the session.
- **It shows `Kimi —` instead of numbers** — the Kimi For Coding credential could not be resolved, or the server plugin is disabled. Run `opencode auth login kimi-code-plan-global` (or `kimi-code-plan-cn` for the kimi.com plan) and check the plugin is enabled again.
- **Global vs. China plan** — `kimi-code-plan-global` is the kimi.ai plan; `kimi-code-plan-cn` is the kimi.com plan. The plugin reads whichever credential is connected, so a single login is enough.

## 📜 Changelog

See the [releases](https://github.com/lnwu/opencode-statusline-plugins/releases) for the release history.

## 📄 License

MIT
