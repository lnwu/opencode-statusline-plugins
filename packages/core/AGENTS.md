# core — development notes

Internal shared package for the statusline plugins: language and theme
resolution, shared statusline TUI helpers, the e2e harness and runner, and the
dev-only build/pack/record helpers. Never published; its code is inlined into
each plugin's `dist/` bundles at build time. Repo-wide rules, commands, and
conventions live in the root `AGENTS.md`.

## Harness recipe

`src/harness.ts` (`createHarness`) drives a real OpenCode TUI in tmux against a
plugin package's built entries and captures the rendered frame; `src/e2e.ts`
(`runE2eCases`) registers a package's cases as `bun test` tests around it. Each
package parameterizes the harness with its own entries and credential env;
`packages/opencode-go-statusline/test/e2e/tui.test.ts` is the reference.

Verified against opencode > 2.0.0:

- Each case runs in an isolated `HOME`/`XDG_*` root with its own managed-service
  port (`opencode service set port`). The default port `49374` is global, so
  isolation alone does not prevent collisions with a running service.
- Credentials: V2 stores accounts in SQLite. `auth.json` is legacy import-only,
  and `opencode auth login` has no non-interactive key flag. The harness sets
  `opencode service set env <credentialEnv>`, an environment connection the
  plugin resolves to a `key` credential.
- Env-connection names: `service set env <name> <value>` must use a name the
  target integration declares (OpenCode Go: `OPENCODE_API_KEY`, GitHub Copilot:
  `GITHUB_TOKEN`). Set `credentialName` when the environment variable the tests
  read (`credentialEnv`) differs from the registered name; the copilot tests
  read `COPILOT_GITHUB_TOKEN` and register `GITHUB_TOKEN`, so a developer's
  unrelated `GITHUB_TOKEN` cannot be picked up by accident. The Copilot
  provider accepts this env `key` connection for real model requests even
  though its plugin only enables model syncing for OAuth credentials.
- The plugin is loaded from the isolated *global* plugin directory
  (`$XDG_CONFIG_HOME/opencode/plugins/<pluginDir>`) as re-export shims pointing
  at the built `dist/index.js` and `dist/tui.js`; project-scoped and
  `opencode.json`-path plugins load but cannot reach their RPC, and a package
  `plugins` entry relying on `exports` does not load at all (see #66).
- The test TUI receives inline CLI settings through
  `OPENCODE_CLI_CONFIG_CONTENT` that hide the sidebar and the tab strip
  (`session.sidebar: "hide"`, `tabs.enabled: false`), so the frame has no
  session-dependent panels and the footer has room for the full statusline at
  160 columns.
- Model readiness: models from the models.dev catalog register asynchronously
  after a fresh service starts, and a prompt sent before its model is
  registered fails with `ModelUnavailableError` (and no provider error on the
  session). `sendPrompt` polls `/api/model` until the case's model appears, so
  prompt-based cases cannot race the catalog sync on a slow network.
- The per-case root lives under `/tmp` to keep the footer directory indicator
  short. Assertions stay pattern-based rather than column-exact, and language
  coverage uses the locale path because `cli.json` plugin options do not reach a
  globally loaded plugin.

Debugging knobs: `E2E_KEEP=1` keeps the per-case root after cleanup,
`E2E_ROOT_BASE` overrides the `/tmp` base, and `E2E_ARTIFACT_DIR` overrides the
artifact directory (default `<packageRoot>/test/e2e/.artifacts`).

Build and packaging helpers are documented in the root `AGENTS.md` and in the
`src/build.ts` / `src/pack.ts` file headers.
