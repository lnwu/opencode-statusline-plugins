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
  return { percent, resetsAt: new Date(Date.now() + resetInMs).toISOString() };
}

test("renders the two quota windows with reset countdowns", async () => {
  const footer = await setupFooterTest({
    tuiEntry: TUI_ENTRY,
    providerID: "kimi-code-plan-global",
    options: { language: "en" },
    width: 160,
    rpcResult: {
      usage: { rolling: window(7, 4 * HOUR + 5 * 60_000), weekly: window(23, 2 * DAY + 3 * HOUR) },
    },
  });

  const frame = await footer.waitForText("Kimi 5h 7%");
  expect(frame).toContain("Kimi 5h 7% (4h5m)");
  expect(frame).toContain("Weekly 23% (2d3h)");
  await footer.dispose();
});

test("labels follow the language option", async () => {
  const footer = await setupFooterTest({
    tuiEntry: TUI_ENTRY,
    providerID: "kimi-code-plan-cn",
    options: { language: "zh-CN" },
    rpcResult: { usage: { rolling: window(7, DAY), weekly: window(23, DAY) } },
  });

  const frame = await footer.waitForText("周 23%");
  expect(frame).toContain("Kimi 5h 7%");
  expect(frame).toContain("周 23%");
  await footer.dispose();
});

test("hides the statusline for sessions on another provider", async () => {
  const footer = await setupFooterTest({
    tuiEntry: TUI_ENTRY,
    providerID: "opencode-other",
    rpcResult: { usage: { rolling: window(7, DAY), weekly: window(23, DAY) } },
  });

  const frame = await footer.renderOnce();
  expect(frame).not.toContain("Kimi");
  await footer.dispose();
});

test("falls back to `Kimi —` without usage", async () => {
  const footer = await setupFooterTest({
    tuiEntry: TUI_ENTRY,
    providerID: "kimi-code-plan-global",
    rpcResult: {},
  });

  const frame = await footer.waitForText("Kimi —");
  expect(frame).toContain("Kimi —");
  await footer.dispose();
});
