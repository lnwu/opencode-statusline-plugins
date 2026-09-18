import { expect, test } from "bun:test"
import { parseUsage } from "../src/usage"

// Live response shapes, trimmed to the fields the plugin reads: a paid plan
// (premium requests) and Copilot Free (premium requests absent, chat window).
const PAID = {
  copilot_plan: "business",
  quota_reset_date: "2026-10-01",
  quota_snapshots: {
    chat: { entitlement: 0, remaining: 0, unlimited: true, has_quota: true },
    completions: { entitlement: 2000, remaining: 1710, unlimited: false, has_quota: true },
    premium_interactions: {
      entitlement: 5000,
      remaining: 639,
      percent_remaining: 12.7,
      unlimited: false,
      has_quota: true,
    },
  },
}

const FREE = {
  quota_reset_date: "2026-10-01",
  quota_snapshots: {
    chat: { entitlement: 200, remaining: 150, percent_remaining: 75, unlimited: false, has_quota: true },
    completions: { entitlement: 2000, remaining: 1710, unlimited: false, has_quota: true },
    premium_interactions: { entitlement: 0, remaining: 0, percent_remaining: 0, unlimited: false, has_quota: false },
  },
}

test("uses the premium-request window for paid plans", () => {
  expect(parseUsage(PAID)).toEqual({
    usedPercent: 87,
    remaining: 639,
    entitlement: 5000,
    unlimited: false,
    resetsAt: "2026-10-01",
  })
})

test("falls back to the chat window when premium requests have no quota", () => {
  expect(parseUsage(FREE)).toEqual({
    usedPercent: 25,
    remaining: 150,
    entitlement: 200,
    unlimited: false,
    resetsAt: "2026-10-01",
  })
})

test("reports unlimited windows", () => {
  const usage = parseUsage({
    quota_snapshots: {
      premium_interactions: { entitlement: 0, remaining: 0, unlimited: true, has_quota: true },
    },
  })
  expect(usage?.unlimited).toBe(true)
  expect(usage?.usedPercent).toBe(0)
})

test("ignores the completions window", () => {
  const usage = parseUsage({
    quota_snapshots: {
      completions: { entitlement: 2000, remaining: 1000, percent_remaining: 50, unlimited: false, has_quota: true },
    },
  })
  expect(usage).toBeUndefined()
})

test("returns undefined when no window has quota", () => {
  expect(
    parseUsage({
      quota_snapshots: {
        premium_interactions: { entitlement: 0, remaining: 0, percent_remaining: 0, unlimited: false, has_quota: false },
        chat: { entitlement: 0, remaining: 0, percent_remaining: 0, unlimited: false, has_quota: false },
      },
    }),
  ).toBeUndefined()
})

test("returns undefined for malformed responses", () => {
  expect(parseUsage(undefined)).toBeUndefined()
  expect(parseUsage({})).toBeUndefined()
  expect(parseUsage({ quota_snapshots: { premium_interactions: { has_quota: true } } })).toBeUndefined()
})

test("falls back to percent_remaining when the entitlement is missing", () => {
  const usage = parseUsage({
    quota_snapshots: { premium_interactions: { percent_remaining: 12.5, has_quota: true } },
  })
  expect(usage?.usedPercent).toBe(88)
  expect(usage?.unlimited).toBe(false)
})

test("prefers the UTC reset timestamp", () => {
  const usage = parseUsage({
    quota_reset_date: "2026-10-01",
    quota_reset_date_utc: "2026-10-01T00:00:00.000Z",
    quota_snapshots: { premium_interactions: { entitlement: 100, remaining: 50, has_quota: true } },
  })
  expect(usage?.resetsAt).toBe("2026-10-01T00:00:00.000Z")
})

test("clamps overage usage to 100%", () => {
  const usage = parseUsage({
    quota_snapshots: { premium_interactions: { entitlement: 100, remaining: -20, has_quota: true } },
  })
  expect(usage?.usedPercent).toBe(100)
})
