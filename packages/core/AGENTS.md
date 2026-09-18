# core — development notes

Internal shared package for the statusline plugins: language resolution, the e2e
harness, the build helper, and the packaging smoke test. Never published; its
code is inlined into each plugin's `dist/` bundles at build time. Repo-wide
rules, commands, and conventions live in the root `AGENTS.md`.

## Harness recipe

`src/harness.ts` (`createHarness`) drives a real OpenCode TUI in tmux against a
plugin package's built entries and captures the rendered frame. Each package
parameterizes it with its own entries and credential env;
`packages/opencode-go-statusline/test/e2e/tui.test.ts` is the reference.

Verified against opencode > 2.0.0:

- Each case runs in an isolated `HOME`/`XDG_*` root with its own managed-service
  port (`opencode service set port`). The default port `49374` is global, so
  isolation alone does not prevent collisions with a running service.
- Credentials: V2 stores accounts in SQLite. `auth.json` is legacy import-only,
  and `opencode auth login` has no non-interactive key flag. The harness sets
  `opencode service set env <credentialEnv>`, an environment connection the
  plugin resolves to a `key` credential.
- The plugin is loaded from the isolated *global* plugin directory
  (`$XDG_CONFIG_HOME/opencode/plugins/<pluginDir>`) as re-export shims pointing
  at the built `dist/index.js` and `dist/tui.js`. A project-scoped plugin
  (`.opencode/plugins/`) renders but its RPC stays unreachable
  (`RPC is unavailable`), leaving the statusline at its fallback; `opencode.json`
  `plugins: ["/abs/path"]` entries that rely on a package's `exports` do not
  load either — that loader only looks for `<dir>/index.ts`.
- The test TUI writes an isolated `cli.json` that hides the sidebar and the tab
  strip (`session.sidebar: "hide"`, `tabs.enabled: false`), so the frame has no
  session-dependent panels and the footer has room for the full statusline at
  160 columns. Inline `OPENCODE_CLI_CONFIG_CONTENT` reaches the TUI process but
  its settings do not take effect on opencode > 2.0.0, so the harness writes the
  file.
- The per-case root lives under `/tmp` to keep the footer directory indicator
  short. Assertions stay pattern-based rather than column-exact, and language
  coverage uses the locale path because `cli.json` plugin options do not reach a
  globally loaded plugin.

Debugging knobs: `E2E_KEEP=1` keeps the per-case root after cleanup,
`E2E_ROOT_BASE` overrides the `/tmp` base, and `E2E_ARTIFACT_DIR` overrides the
artifact directory (default `<packageRoot>/test/e2e/.artifacts`).

Build and packaging helpers are documented in the root `AGENTS.md` and in the
`src/build.ts` / `src/pack.ts` file headers.
