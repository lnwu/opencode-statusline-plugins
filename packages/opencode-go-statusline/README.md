# opencode-go-statusline

[![npm version](https://img.shields.io/npm/v/opencode-go-statusline)](https://www.npmjs.com/package/opencode-go-statusline)
[![license](https://img.shields.io/npm/l/opencode-go-statusline)](https://github.com/lnwu/opencode-statusline-plugins/blob/main/packages/opencode-go-statusline/LICENSE)

**English** | [简体中文](https://github.com/lnwu/opencode-statusline-plugins/blob/main/packages/opencode-go-statusline/README.zh-CN.md)

Display your OpenCode Go subscription quota in the TUI footer statusline.

## Features

- Live **rolling 5h / weekly / monthly** usage percentages in the prompt footer
- Reset countdowns when the footer details are expanded (or the terminal is wide enough)
- Color feedback: subdued normally, info at ≥70%, error at ≥90% or when a quota window reports a non-`ok` status
- Only appears for sessions whose model provider is `opencode-go`
- Usage refreshes about once per minute

## Requirements

- OpenCode `>2.0.0`
- An active OpenCode Go credential (`opencode-go`)

## Install

```sh
opencode plugin add opencode-go-statusline
```

Or add it to your `~/.config/opencode/opencode.json`:

```jsonc
{
  "plugins": ["opencode-go-statusline"]
}
```

## Troubleshooting

- **The statusline never shows up** — it is hidden unless the session's model provider is `opencode-go`. Switch to an OpenCode Go model in the session.
- **It shows `Go —` instead of numbers** — the `opencode-go` credential could not be resolved, or the server plugin is disabled. Check your OpenCode Go login.

## License

MIT
