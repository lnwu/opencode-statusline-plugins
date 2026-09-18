// End-to-end integration tests: boot a real `opencode` TUI against the built
// `dist/` entries and assert the footer statusline. The reusable harness lives
// in `core/src/harness.ts`; this file configures it and declares the cases.
// Requires the OpenCode CLI and tmux on PATH and COPILOT_GITHUB_TOKEN (the
// device-flow GitHub token, with Copilot access; see AGENTS.md).
//
// The live credential is registered as a service environment connection named
// GITHUB_TOKEN (the env method OpenCode's Copilot integration declares), while
// the tests read it from COPILOT_GITHUB_TOKEN, so an unrelated developer
// GITHUB_TOKEN cannot be picked up by accident. The plugin accepts both that
// `key` connection and the OAuth credential the device flow stores.
//
// Run: bun run build && COPILOT_GITHUB_TOKEN=... bun run test
import { join, resolve } from "node:path"
import { afterAll, beforeAll, expect, test } from "bun:test"
import { createHarness, type CaseContext, type CaseSpec } from "core/harness"

const PACKAGE_ROOT = resolve(import.meta.dir, "..", "..")
const CASE_TIMEOUT_MS = 240_000

const harness = createHarness({
  packageRoot: PACKAGE_ROOT,
  serverEntry: join(PACKAGE_ROOT, "dist", "index.js"),
  tuiEntry: join(PACKAGE_ROOT, "dist", "tui.js"),
  credentialEnv: "COPILOT_GITHUB_TOKEN",
  // The Copilot integration declares `GITHUB_TOKEN` as its env method, so the
  // live credential is registered under that service env name while the tests
  // read it from COPILOT_GITHUB_TOKEN.
  credentialName: "GITHUB_TOKEN",
  invalidCredential: "gho_e2e_invalid",
})

// One object per scenario. `expect` patterns must all match the captured frame,
// `reject` patterns must not. Cases with `prompt` send a real model request
// before the TUI starts and require it to succeed.
const CASES: CaseSpec[] = [
  {
    // Happy path: live quota for a Copilot session, with the model answering.
    // Cheapest current model so CI spends as little quota as possible.
    name: "en-wide-usage",
    width: 160,
    height: 20,
    model: { providerID: "github-copilot", id: "claude-haiku-4.5" },
    prompt: "Reply with the single word: ok",
    expect: [/Copilot \d+%/, /\(\d+(d\d+h|h\d+m|m)\)/, /\bok\b/],
  },
  {
    // The statusline is hidden for sessions whose provider is not
    // github-copilot. No real request: a local stub provider supplies the model.
    name: "non-copilot-session-hidden",
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
    reject: [/Copilot/],
  },
  {
    // Unresolvable credential: the statusline still renders, as `Copilot —`.
    name: "invalid-credential-fallback",
    width: 160,
    height: 20,
    model: { providerID: "github-copilot", id: "claude-haiku-4.5" },
    credential: "invalid",
    expect: [/Copilot —/],
  },
]

beforeAll(async () => {
  harness.requireCredential()
  await harness.assertTools()
}, 60_000)

const contexts: CaseContext[] = []

afterAll(async () => {
  for (const context of contexts) await harness.cleanupCase(context)
}, 120_000)

for (const spec of CASES) {
  test(
    spec.name,
    async () => {
      const context = await harness.prepareCase(spec)
      contexts.push(context)
      let frame = ""
      try {
        console.log(`[${spec.name}] session=${context.sessionID} service=:${context.servicePort}`)

        if (spec.prompt) {
          await harness.sendPrompt(context, spec.prompt)
          console.log(`[${spec.name}] model request succeeded`)
        }

        await harness.startTui(context)
        frame = await harness.waitForFrame(context, spec.expect[0]!)

        for (const pattern of spec.expect) {
          expect(frame, `expected ${pattern} in ${spec.name} frame`).toMatch(pattern)
        }
        for (const pattern of spec.reject ?? []) {
          expect(frame, `did not expect ${pattern} in ${spec.name} frame`).not.toMatch(pattern)
        }
      } catch (error) {
        const captured = frame || (await context.capture().catch(() => ""))
        if (!frame && captured) frame = captured
        console.error(`[${spec.name}] captured frame:\n${captured}`)
        throw error
      } finally {
        if (frame) await harness.writeArtifacts(context, frame)
      }
    },
    CASE_TIMEOUT_MS,
  )
}
