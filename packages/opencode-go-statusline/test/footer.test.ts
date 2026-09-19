// Footer unit tests: render the built TUI entry with a mocked usage RPC and
// session provider, and assert the statusline text. See `core/src/test-footer.ts`
// for the harness and the `--conditions=browser` requirement.
import { expect, test } from "bun:test";
import { join } from "node:path";
import { setupFooterTest } from "core/test-footer";

const TUI_ENTRY = join(import.meta.dir, "..", "dist", "tui.js");

const HOUR = 3600_000;
const DAY = 24 * HOUR;

function window(percent: number, resetInMs: number) {
  return { status: "ok", percent, resetsAt: new Date(Date.now() + resetInMs).toISOString() };
}

test("renders the three quota windows with reset countdowns", async () => {
  const footer = await setupFooterTest({
    tuiEntry: TUI_ENTRY,
    providerID: "opencode-go",
    options: { language: "en" },
    width: 160,
    rpcResult: {
      usage: {
        rolling: window(3, 2 * DAY + 3 * HOUR),
        weekly: window(12, 4 * HOUR + 5 * 60_000),
        monthly: window(45, 12 * DAY + 6 * HOUR),
      },
    },
  });

  const frame = await footer.waitForText("Go 5h 3%");
  expect(frame).toContain("Go 5h 3% (2d3h)");
  expect(frame).toContain("Weekly 12% (4h5m)");
  expect(frame).toContain("Monthly 45% (12d6h)");
  await footer.dispose();
});

test("labels follow the language option", async () => {
  const footer = await setupFooterTest({
    tuiEntry: TUI_ENTRY,
    providerID: "opencode-go",
    options: { language: "zh-CN" },
    rpcResult: {
      usage: { rolling: window(3, DAY), weekly: window(12, DAY), monthly: window(45, DAY) },
    },
  });

  const frame = await footer.waitForText("周 12%");
  expect(frame).toContain("Go 5h 3%");
  expect(frame).toContain("周 12%");
  expect(frame).toContain("月 45%");
  await footer.dispose();
});

test("hides the statusline for sessions on another provider", async () => {
  const footer = await setupFooterTest({
    tuiEntry: TUI_ENTRY,
    providerID: "opencode-other",
    rpcResult: {
      usage: { rolling: window(3, DAY), weekly: window(12, DAY), monthly: window(45, DAY) },
    },
  });

  const frame = await footer.renderOnce();
  expect(frame).not.toContain("Go 5h");
  expect(frame).not.toContain("Go —");
  await footer.dispose();
});

test("falls back to `Go —` without usage", async () => {
  const footer = await setupFooterTest({
    tuiEntry: TUI_ENTRY,
    providerID: "opencode-go",
    rpcResult: {},
  });

  const frame = await footer.waitForText("Go —");
  expect(frame).toContain("Go —");
  await footer.dispose();
});
