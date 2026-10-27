// Footer unit tests: render the built TUI entry with a mocked usage RPC and
// session provider, and assert the statusline text. See `core/src/test-footer.ts`
// for the harness and the `--conditions=browser` requirement.
import { expect, jest, test } from "bun:test";
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
        resetsAt: new Date(
          Date.now() + 12 * 24 * 3600_000 + 6 * 3600_000,
        ).toISOString(),
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
      usage: {
        usedPercent: 42,
        remaining: 174,
        entitlement: 300,
        unlimited: false,
      },
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

test("shows the account label after the title", async () => {
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
        account: "work",
      },
    },
  });

  const frame = await footer.waitForText("Copilot · Work 42%");
  expect(frame).toContain("Copilot · Work 42%");
  await footer.dispose();
});

test("clears the previous account's quota when the new account has none", async () => {
  jest.useFakeTimers();
  let calls = 0;
  let result: unknown = {
    usage: {
      usedPercent: 42,
      remaining: 174,
      entitlement: 300,
      unlimited: false,
      account: "work",
    },
  };
  try {
    const footer = await setupFooterTest({
      tuiEntry: TUI_ENTRY,
      providerID: "github-copilot",
      width: 160,
      rpcResult: () => {
        calls += 1;
        return result;
      },
    });
    await flush();
    expect(await footer.renderOnce()).toContain("Copilot · Work 42%");

    result = {};
    jest.advanceTimersByTime(60_000);
    await flush();
    expect(calls).toBe(2);
    const frame = await footer.renderOnce();
    expect(frame).toContain("Copilot —");
    expect(frame).not.toContain("42%");
    await footer.dispose();
  } finally {
    jest.useRealTimers();
  }
});

test("drops the countdown between 80 and 119 columns", async () => {
  const footer = await setupFooterTest({
    tuiEntry: TUI_ENTRY,
    providerID: "github-copilot",
    width: 101,
    showDetails: true,
    rpcResult: {
      usage: {
        usedPercent: 42,
        remaining: 174,
        entitlement: 300,
        unlimited: false,
        account: "work",
        resetsAt: new Date(Date.now() + 12 * 24 * 3600_000).toISOString(),
      },
    },
  });

  const frame = await footer.waitForText("Copilot · Work 42%");
  expect(frame).not.toContain("(");
  await footer.dispose();
});

test("drops the account label below 80 columns", async () => {
  const footer = await setupFooterTest({
    tuiEntry: TUI_ENTRY,
    providerID: "github-copilot",
    width: 60,
    rpcResult: {
      usage: {
        usedPercent: 42,
        remaining: 174,
        entitlement: 300,
        unlimited: false,
        account: "work",
      },
    },
  });

  const frame = await footer.waitForText("Copilot 42%");
  expect(frame).not.toContain("Work");
  await footer.dispose();
});

test("truncates a long account label", async () => {
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
        account: "a-very-long-account-label",
      },
    },
  });

  const frame = await footer.waitForText("Copilot · A-very-long-acc… 42%");
  expect(frame).not.toContain("account-label");
  await footer.dispose();
});

/** Lets the polled RPC promise and the resulting signal updates settle. */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}
