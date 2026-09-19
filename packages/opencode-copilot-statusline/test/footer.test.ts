// Footer unit tests: render the built TUI entry with a mocked usage RPC and
// session provider, and assert the statusline text. See `core/src/test-footer.ts`
// for the harness and the `--conditions=browser` requirement.
import { expect, test } from "bun:test";
import { join } from "node:path";
import { setupFooterTest } from "core/test-footer";

const TUI_ENTRY = join(import.meta.dir, "..", "dist", "tui.js");

test("renders the premium-request quota with the monthly reset countdown", async () => {
  const footer = await setupFooterTest({
    tuiEntry: TUI_ENTRY,
    providerID: "github-copilot",
    width: 160,
    rpcResult: {
      usage: {
        usedPercent: 42,
        remaining: 174,
        entitlement: 300,
        unlimited: false,
        resetsAt: new Date(Date.now() + 12 * 24 * 3600_000 + 6 * 3600_000).toISOString(),
      },
    },
  });

  const frame = await footer.waitForText("Copilot 42%");
  expect(frame).toContain("Copilot 42% (12d6h)");
  await footer.dispose();
});

test("renders an unlimited window as `∞`", async () => {
  const footer = await setupFooterTest({
    tuiEntry: TUI_ENTRY,
    providerID: "github-copilot",
    rpcResult: {
      usage: { usedPercent: 0, remaining: 0, entitlement: 0, unlimited: true },
    },
  });

  const frame = await footer.waitForText("Copilot ∞");
  expect(frame).toContain("Copilot ∞");
  await footer.dispose();
});

test("hides the statusline for sessions on another provider", async () => {
  const footer = await setupFooterTest({
    tuiEntry: TUI_ENTRY,
    providerID: "opencode-other",
    rpcResult: {
      usage: { usedPercent: 42, remaining: 174, entitlement: 300, unlimited: false },
    },
  });

  const frame = await footer.renderOnce();
  expect(frame).not.toContain("Copilot");
  await footer.dispose();
});

test("falls back to `Copilot —` without usage", async () => {
  const footer = await setupFooterTest({
    tuiEntry: TUI_ENTRY,
    providerID: "github-copilot",
    rpcResult: {},
  });

  const frame = await footer.waitForText("Copilot —");
  expect(frame).toContain("Copilot —");
  await footer.dispose();
});
