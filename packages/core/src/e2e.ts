// Shared end-to-end runner: turns a package's `CaseSpec[]` into `bun test`
// cases that drive the real OpenCode TUI through `core/harness` and assert the
// captured frame. The package test files only configure the harness and
// declare their cases; credential/tool checks, cleanup, artifact writing and
// failure output live here so the packages cannot drift apart.
import { afterAll, beforeAll, expect, test } from "bun:test";
import type { CaseContext, CaseSpec, Harness } from "./harness";

/** Per-case budget: covers a model request plus the TUI start and capture. */
export const CASE_TIMEOUT_MS = 240_000;

export function runE2eCases(harness: Harness, cases: CaseSpec[]): void {
  beforeAll(async () => {
    harness.requireCredential();
    await harness.assertTools();
  }, 60_000);

  const contexts: CaseContext[] = [];

  afterAll(async () => {
    for (const context of contexts) await harness.cleanupCase(context);
  }, 120_000);

  for (const spec of cases) {
    test(
      spec.name,
      async () => {
        const context = await harness.prepareCase(spec);
        contexts.push(context);
        let frame = "";
        try {
          console.log(
            `[${spec.name}] session=${context.sessionID} service=:${context.servicePort}`,
          );

          if (spec.prompt) {
            await harness.sendPrompt(context, spec.prompt);
            console.log(`[${spec.name}] model request succeeded`);
          }

          await harness.startTui(context);
          frame = await harness.waitForFrame(context, spec.expect[0]!);

          for (const pattern of spec.expect) {
            expect(frame, `expected ${pattern} in ${spec.name} frame`).toMatch(pattern);
          }
          for (const pattern of spec.reject ?? []) {
            expect(frame, `did not expect ${pattern} in ${spec.name} frame`).not.toMatch(pattern);
          }
        } catch (error) {
          const captured = frame || (await context.capture().catch(() => ""));
          if (!frame && captured) frame = captured;
          console.error(`[${spec.name}] captured frame:\n${captured}`);
          throw error;
        } finally {
          if (frame) await harness.writeArtifacts(context, frame);
        }
      },
      CASE_TIMEOUT_MS,
    );
  }
}
