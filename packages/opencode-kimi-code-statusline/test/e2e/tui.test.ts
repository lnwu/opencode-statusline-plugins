// End-to-end integration tests: boot a real `opencode` TUI against the built
// `dist/` entries and assert the footer statusline. The reusable harness lives
// in `core/src/harness.ts`; this file configures it and declares the cases.
// Requires the OpenCode CLI and tmux on PATH and KIMI_CODE_API_KEY (see
// AGENTS.md).
//
// The live credential is registered as a service environment connection named
// KIMI_API_KEY (the env method the Kimi For Coding integrations declare),
// while the tests read it from KIMI_CODE_API_KEY, so an unrelated developer
// KIMI_API_KEY (e.g. a pay-as-you-go Moonshot key) cannot be picked up by
// accident.
//
// Run: bun run build && KIMI_CODE_API_KEY=sk-... bun run test
import { join, resolve } from "node:path"
import { afterAll, beforeAll, expect, test } from "bun:test"
import { createHarness, type CaseContext, type CaseSpec } from "core/harness"

const PACKAGE_ROOT = resolve(import.meta.dir, "..", "..")
const CASE_TIMEOUT_MS = 240_000

const harness = createHarness({
  packageRoot: PACKAGE_ROOT,
  serverEntry: join(PACKAGE_ROOT, "dist", "index.js"),
  tuiEntry: join(PACKAGE_ROOT, "dist", "tui.js"),
  credentialEnv: "KIMI_CODE_API_KEY",
  // The Kimi For Coding integrations declare `KIMI_API_KEY` as their env
  // method, so the live credential is registered under that service env name
  // while the tests read it from KIMI_CODE_API_KEY.
  credentialName: "KIMI_API_KEY",
  invalidCredential: "sk-e2e-invalid",
})

// One object per scenario. `expect` patterns must all match the captured frame,
// `reject` patterns must not. Cases with `prompt` send a real model request
// before the TUI starts and require it to succeed.
const CASES: CaseSpec[] = [
  {
    // Happy path: live quota for a Kimi session, with the model answering.
    name: "en-wide-usage",
    width: 160,
    height: 20,
    model: { providerID: "kimi-code-plan-global", id: "kimi-for-coding" },
    prompt: "Reply with the single word: ok",
    expect: [/Kimi 5h \d+%/, /Weekly \d+%/, /\bok\b/],
  },
  {
    // Labels follow the terminal locale (no language option configured).
    name: "zh-CN-locale",
    width: 160,
    height: 20,
    language: "zh-CN",
    model: { providerID: "kimi-code-plan-global", id: "kimi-for-coding" },
    prompt: "Reply with the single word: ok",
    expect: [/Kimi 5h \d+%/, /周 \d+%/],
  },
  {
    // The statusline is hidden for sessions whose provider is not a Kimi plan.
    // No real request: a local stub provider supplies the model.
    name: "non-kimi-session-hidden",
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
    reject: [/Kimi/, /5h \d+%/, /Weekly \d+%/],
  },
  {
    // Unresolvable credential: the statusline still renders, as `Kimi —`.
    name: "invalid-key-fallback",
    width: 160,
    height: 20,
    model: { providerID: "kimi-code-plan-global", id: "kimi-for-coding" },
    credential: "invalid",
    expect: [/Kimi —/],
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
