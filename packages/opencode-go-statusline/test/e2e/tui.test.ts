// End-to-end integration tests: boot a real `opencode` TUI against the working
// tree and assert the footer statusline. Requires the OpenCode CLI on PATH and
// OPENCODE_API_KEY (see AGENTS.md).
//
// Run: bun run build && OPENCODE_API_KEY=... bun run test
import { afterAll, beforeAll, expect, test } from "bun:test"
import {
  cleanupCase,
  prepareCase,
  requireApiKey,
  run,
  sendPrompt,
  startTui,
  waitForFrame,
  writeArtifacts,
  type CaseContext,
  type CaseSpec,
} from "./harness"

const CASE_TIMEOUT_MS = 240_000

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
    invalidKey: true,
    expect: [/Go —/],
  },
]

let apiKey = ""

const TOOLS = [
  { name: "opencode", args: ["--version"] },
  { name: "tmux", args: ["-V"] },
]

async function checkTool(name: string, args: string[]): Promise<{ ok: boolean; version: string; error?: string }> {
  try {
    const result = await run([name, ...args], { timeoutMs: 30_000 })
    const version = result.stdout.trim().split("\n")[0] ?? ""
    if (result.code === 0 && version) return { ok: true, version }
    return { ok: false, version, error: result.stderr.trim() || `exit ${result.code}` }
  } catch (error) {
    return { ok: false, version: "", error: String(error) }
  }
}

beforeAll(async () => {
  apiKey = requireApiKey()
  for (const tool of TOOLS) {
    const check = await checkTool(tool.name, tool.args)
    if (!check.ok) throw new Error(`${tool.name} is required for the integration tests: ${check.error ?? "not found"}`)
    console.log(check.version)
  }
}, 60_000)

const contexts: CaseContext[] = []

afterAll(async () => {
  for (const context of contexts) await cleanupCase(context)
}, 120_000)

for (const spec of CASES) {
  test(
    spec.name,
    async () => {
      const context = await prepareCase(spec, apiKey)
      contexts.push(context)
      let frame = ""
      try {
        console.log(`[${spec.name}] session=${context.sessionID} service=:${context.servicePort}`)

        if (spec.prompt) {
          await sendPrompt(context, spec.prompt)
          console.log(`[${spec.name}] model request succeeded`)
        }

        await startTui(context)
        frame = await waitForFrame(context, spec.expect[0]!)

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
        if (frame) await writeArtifacts(context, frame)
      }
    },
    CASE_TIMEOUT_MS,
  )
}
