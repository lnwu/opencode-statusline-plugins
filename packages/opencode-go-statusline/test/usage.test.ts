import { expect, test } from "bun:test";
import { parseUsage } from "../src/usage";

// Live response shape, trimmed to the fields the plugin reads: the three
// quota windows, each with a status, a used percentage, and a reset time.
const LIVE = {
  usage: {
    rolling: {
      status: "ok",
      percent: 63,
      resetsAt: "2026-09-19T07:40:09Z",
    },
    weekly: {
      status: "ok",
      percent: 18,
      resetsAt: "2026-09-23T08:40:09Z",
    },
    monthly: {
      status: "ok",
      percent: 7,
      resetsAt: "2026-10-01T00:00:00Z",
    },
  },
};

test("parses the three quota windows", () => {
  expect(parseUsage(LIVE)).toEqual(LIVE.usage);
});

test("keeps a non-ok window status", () => {
  const usage = parseUsage({
    usage: { ...LIVE.usage, rolling: { ...LIVE.usage.rolling, status: "exceeded" } },
  });
  expect(usage?.rolling.status).toBe("exceeded");
  expect(usage?.weekly.percent).toBe(18);
});

test("rejects a response missing a window", () => {
  const { monthly: _monthly, ...withoutMonthly } = LIVE.usage;
  expect(parseUsage({ usage: withoutMonthly })).toBeUndefined();
});

test("rejects windows with malformed fields", () => {
  const rolling = LIVE.usage.rolling;
  expect(
    parseUsage({ usage: { ...LIVE.usage, rolling: { ...rolling, percent: "63" } } }),
  ).toBeUndefined();
  expect(
    parseUsage({ usage: { ...LIVE.usage, rolling: { ...rolling, status: 200 } } }),
  ).toBeUndefined();
  expect(
    parseUsage({ usage: { ...LIVE.usage, rolling: { ...rolling, resetsAt: "" } } }),
  ).toBeUndefined();
});

test("returns undefined for malformed responses", () => {
  expect(parseUsage(undefined)).toBeUndefined();
  expect(parseUsage({})).toBeUndefined();
  expect(parseUsage({ usage: [] })).toBeUndefined();
  expect(parseUsage({ usage: { rolling: LIVE.usage.rolling } })).toBeUndefined();
});
