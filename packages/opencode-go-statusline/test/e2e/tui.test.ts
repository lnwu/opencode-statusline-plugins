// End-to-end integration tests: boot a real `opencode` TUI against the built
// `dist/` entries and assert the footer statusline. The reusable harness lives
// in `core/src/harness.ts`, the shared runner in `core/src/e2e.ts`; this file
// only configures the harness and declares the cases.
// Requires the OpenCode CLI and tmux on PATH and OPENCODE_API_KEY (see
// AGENTS.md).
//
// Run: bun run build && OPENCODE_API_KEY=... bun run test
import { join, resolve } from "node:path";
import { runE2eCases } from "core/e2e";
import { createHarness, type CaseSpec } from "core/harness";

const PACKAGE_ROOT = resolve(import.meta.dir, "..", "..");

const harness = createHarness({
  packageRoot: PACKAGE_ROOT,
  serverEntry: join(PACKAGE_ROOT, "dist", "index.js"),
  tuiEntry: join(PACKAGE_ROOT, "dist", "tui.js"),
  credentialEnv: "OPENCODE_API_KEY",
  invalidCredential: "sk-e2e-invalid",
});

// One object per scenario. `expect` patterns must all match the captured frame,
// `reject` patterns must not. Cases with `prompt` send a real model request
// before the TUI starts and require it to succeed.
const CASES: CaseSpec[] = [
  {
    // Happy path: live quota for a Go session, with the model answering.
    name: "en-wide-usage",
    width: 160,
    height: 20,
    model: { providerID: "opencode-go", id: "deepseek-v4.1-flash" },
    prompt: "Reply with the single word: ok",
    expect: [/Go 5h \d+%/, /Weekly \d+%/, /Monthly \d+%/, /\bok\b/],
  },
  {
    // Labels follow the terminal locale (no language option configured).
    name: "zh-CN-locale",
    width: 160,
    height: 20,
    language: "zh-CN",
    model: { providerID: "opencode-go", id: "deepseek-v4.1-flash" },
    prompt: "Reply with the single word: ok",
    expect: [/Go 5h \d+%/, /周 \d+%/, /月 \d+%/],
  },
  {
    // The statusline is hidden for sessions whose provider is not opencode-go.
    // No real request: a local stub provider supplies the model.
    name: "non-go-session-hidden",
    width: 160,
    height: 20,
    model: { providerID: "e2e-other", id: "stub" },
    providers: {
      "e2e-other": {
        name: "E2E Other",
        package: "@opencode/ai/providers/openai-compatible",
        settings: { baseURL: "http://127.0.0.1:1/v1", apiKey: "unused" },
        models: { stub: { name: "Stub Model" } },
      },
    },
    expect: [/Stub Model/],
    reject: [/Go 5h \d+%/, /Go —/, /5h \d+%/],
  },
  {
    // Unresolvable credential: the statusline still renders, as `Go —`.
    name: "invalid-key-fallback",
    width: 160,
    height: 20,
    model: { providerID: "opencode-go", id: "deepseek-v4.1-flash" },
    credential: "invalid",
    expect: [/Go —/],
  },
];

runE2eCases(harness, CASES);
