# core — development notes

Internal shared package for the statusline plugins: language and theme
resolution, shared statusline TUI helpers, the e2e harness and runner, the
footer test helper, and the dev-only build/pack/record helpers. Never
published; its code is inlined into each plugin's `dist/` bundles at build
time. Repo-wide rules, commands, and conventions live in the root `AGENTS.md`.

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
  `opencode service set env <credentialName>` (default: `credentialEnv`), an
  environment connection the plugin resolves to a `key` credential.
- Env-connection names: `service set env <name> <value>` must use a name the
  target integration declares. Set `credentialName` when the environment
  variable the tests read (`credentialEnv`) differs from the registered name,
  so an unrelated developer variable cannot be picked up by accident. Each
  package's names are listed in the root `AGENTS.md` (Integration tests).
- The plugin is loaded from the isolated _global_ plugin directory
  (`$XDG_CONFIG_HOME/opencode/plugins/<pluginDir>`) as re-export shims pointing
  at the built `dist/index.js` and `dist/tui.js`. A project-scoped plugin
  (`.opencode/plugins/`) renders but cannot reach its RPC
  (`RPC is unavailable`), and an `opencode.json` `plugins` path entry that
  relies on the package `exports` does not load at all (see #66).
- The test TUI receives inline CLI settings through
  `OPENCODE_CLI_CONFIG_CONTENT` that hide the sidebar and the tab strip
  (`session.sidebar: "hide"`, `tabs.enabled: false`), so the frame has no
  session-dependent panels and the footer has room for the full statusline at
  the 160 columns the cases use.
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

## Footer unit tests

`src/test-footer.ts` (`setupFooterTest`) is the credential-free counterpart to
the harness: it renders a package's built `dist/tui.js` in the OpenTUI test
renderer (`@opentui/solid`'s `testRender`), mocking the plugin `Context`
surface the TUI entry touches — the usage RPC (`client.rpc`), the session
provider gate (`data.session`), `options`, and the theme — and captures the
footer frame for text assertions. Each package's `test/footer.test.ts` carries
only its cases; it is the merge gate.

Two non-obvious requirements:

- Run the tests with `bun test --conditions=browser` (the package `test`
  script already does; seen on Bun 1.4.4 with solid-js 1.9.15). Bun's default
  resolution selects solid-js's server build, where `createEffect` never runs
  and signals do not propagate, so the statusline would stay in its initial
  state and `waitForText` would hang. The browser condition selects the
  reactive build; `assertReactiveSolid` turns a missing flag into a clear
  error.
- Test the built `dist/tui.js`, never `src/`: `src` imports `core/*.tsx`
  through the node_modules symlink, where the Solid transform is skipped — the
  same limitation that makes the published entries pre-compiled. The helper
  imports the entry dynamically, which also keeps it typecheckable before
  `dist/` exists.

Build and packaging helpers are documented in the root `AGENTS.md` and in the
`src/build.ts` / `src/pack.ts` file headers.
