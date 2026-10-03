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

test("uses short labels and no countdowns between 80 and 119 columns", async () => {
  const footer = await setupFooterTest({
    tuiEntry: TUI_ENTRY,
    providerID: "opencode-go",
    options: { language: "en" },
    width: 101,
    showDetails: true,
    rpcResult: {
      usage: { rolling: window(3, DAY), weekly: window(12, DAY), monthly: window(45, DAY) },
    },
  });

  const frame = await footer.waitForText("Go 5H 3%");
  expect(frame).toContain("Go 5H 3% · W 12% · M 45%");
  expect(frame).not.toContain("(");
  await footer.dispose();
});

test("shows only the weekly window below 80 columns", async () => {
  const footer = await setupFooterTest({
    tuiEntry: TUI_ENTRY,
    providerID: "opencode-go",
    options: { language: "en" },
    width: 60,
    rpcResult: {
      usage: { rolling: window(3, DAY), weekly: window(12, DAY), monthly: window(45, DAY) },
    },
  });

  const frame = await footer.waitForText("Go W 12%");
  expect(frame).not.toContain("5H");
  expect(frame).not.toContain("M 45%");
  await footer.dispose();
});

test("labels follow the language option", async () => {
  const footer = await setupFooterTest({
    tuiEntry: TUI_ENTRY,
    providerID: "opencode-go",
    options: { language: "zh-CN" },
    width: 120,
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

test("keeps the Chinese labels in the compact and minimal layouts", async () => {
  const compact = await setupFooterTest({
    tuiEntry: TUI_ENTRY,
    providerID: "opencode-go",
    options: { language: "zh-CN" },
    width: 100,
    rpcResult: {
      usage: { rolling: window(3, DAY), weekly: window(12, DAY), monthly: window(45, DAY) },
    },
  });
  expect(await compact.waitForText("周 12%")).toContain("Go 5H 3% · 周 12% · 月 45%");
  await compact.dispose();

  const minimal = await setupFooterTest({
    tuiEntry: TUI_ENTRY,
    providerID: "opencode-go",
    options: { language: "zh-CN" },
    width: 60,
    rpcResult: {
      usage: { rolling: window(3, DAY), weekly: window(12, DAY), monthly: window(45, DAY) },
    },
  });
  expect(await minimal.waitForText("Go 周 12%")).not.toContain("5H");
  await minimal.dispose();
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
