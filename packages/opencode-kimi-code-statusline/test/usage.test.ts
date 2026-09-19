import { expect, test } from "bun:test"
import { parseUsage } from "../src/usage"

// Live response shape, trimmed to the fields the plugin reads. Both quota
// windows are reported twice: as absolute strings (`limits[].detail` for the
// rolling 5-hour window, `usage` for the weekly one) and as precise ratios
// (`usages.limit_5h` / `usages.limit_7d`). `booster_wallet` is a top-up
// balance OpenCode never draws from.
const LIVE = {
  usage: { limit: "100", used: "18", remaining: "82", resetTime: "2026-09-23T08:40:09.844508Z" },
  limits: [
    {
      window: { duration: 300, timeUnit: "TIME_UNIT_MINUTE" },
      detail: { limit: "100", used: "63", remaining: "37", resetTime: "2026-09-19T07:40:09.844508Z" },
    },
  ],
  usages: {
    limit_5h: { used_ratio: 0.628517, reset_time: "2026-09-19T07:40:09Z" },
    limit_7d: { used_ratio: 0.178663, reset_time: "2026-09-23T08:40:09Z" },
  },
  booster_wallet: { status: "STATUS_ACTIVE" },
}

test("prefers the precise ratios for both windows", () => {
  expect(parseUsage(LIVE)).toEqual({
    rolling: { percent: 63, resetsAt: "2026-09-19T07:40:09Z" },
    weekly: { percent: 18, resetsAt: "2026-09-23T08:40:09Z" },
  })
})

test("falls back to the absolute limits when the ratios are missing", () => {
  const { usages: _usages, ...body } = LIVE
  expect(parseUsage(body)).toEqual({
    rolling: { percent: 63, resetsAt: "2026-09-19T07:40:09.844508Z" },
    weekly: { percent: 18, resetsAt: "2026-09-23T08:40:09.844508Z" },
  })
})

test("falls back per window when only one ratio is reported", () => {
  const usage = parseUsage({
    about: "unused",
    usage: { limit: 100, remaining: 50, resetTime: "2026-09-23T08:40:09Z" },
    usages: { limit_5h: { used_ratio: 0.5 } },
  })
  expect(usage).toEqual({
    rolling: { percent: 50 },
    weekly: { percent: 50, resetsAt: "2026-09-23T08:40:09Z" },
  })
})

test("selects the 300-minute entry when several rolling windows are reported", () => {
  const usage = parseUsage({
    usage: { limit: "100", remaining: "0" },
    limits: [
      { window: { duration: 1440, timeUnit: "TIME_UNIT_MINUTE" }, detail: { limit: "100", remaining: "0" } },
      { window: { duration: 300, timeUnit: "TIME_UNIT_MINUTE" }, detail: { limit: "100", remaining: "40" } },
    ],
  })
  expect(usage?.rolling.percent).toBe(60)
})

test("accepts numeric JSON values as well as strings", () => {
  const usage = parseUsage({
    usage: { limit: 100, remaining: 25 },
    limits: [{ window: { duration: 300 }, detail: { limit: 10, remaining: 4 } }],
  })
  expect(usage).toEqual({ rolling: { percent: 60 }, weekly: { percent: 75 } })
})

test("rounds to whole percentages", () => {
  const usage = parseUsage({
    usage: { limit: "100", remaining: "62.5" },
    limits: [{ window: { duration: 300 }, detail: { limit: "100", remaining: "62.5" } }],
  })
  expect(usage?.rolling.percent).toBe(38)
  expect(usage?.weekly.percent).toBe(38)
})

test("clamps overage usage to 100%", () => {
  const usage = parseUsage({
    usage: { limit: "100", remaining: "-20" },
    limits: [{ window: { duration: 300 }, detail: { limit: "100", remaining: "-20" } }],
    usages: { limit_5h: { used_ratio: 1.2 }, limit_7d: { used_ratio: 1.2 } },
  })
  expect(usage?.rolling.percent).toBe(100)
  expect(usage?.weekly.percent).toBe(100)
})

test("returns undefined for malformed responses", () => {
  expect(parseUsage(undefined)).toBeUndefined()
  expect(parseUsage({})).toBeUndefined()
  expect(parseUsage({ usages: {} })).toBeUndefined()
  expect(parseUsage({ limits: [] })).toBeUndefined()
  expect(parseUsage({ usage: { limit: "0", remaining: "0" } })).toBeUndefined()
  expect(parseUsage({ limits: [{ window: { duration: 300 }, detail: { limit: "0", remaining: "0" } }] })).toBeUndefined()
})
