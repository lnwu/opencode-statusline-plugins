// Mapping from the GitHub Copilot quota API to the statusline usage value.
//
// `GET /copilot_internal/user` returns `quota_snapshots` keyed by quota id.
// Paid plans carry the premium-request quota in `premium_interactions`. Plans
// without one (Copilot Free) report it as `has_quota: false` and track their
// chat/agent allowance in `chat` instead, so that window is the fallback.
// `completions` (inline suggestions) is never consumed by an OpenCode session
// and is ignored.
//
// A window with `has_quota: false` must not fall through to a percentage: its
// `percent_remaining` is 0, which would read as "100% used".
export type Usage = {
  /** Used percentage of the selected quota, 0-100. Always 0 when unlimited. */
  usedPercent: number
  remaining: number
  entitlement: number
  unlimited: boolean
  /** Monthly reset timestamp (`quota_reset_date_utc` ISO, or `quota_reset_date`). */
  resetsAt?: string
}

const WINDOW_IDS = ["premium_interactions", "chat"] as const

export function parseUsage(body: unknown): Usage | undefined {
  if (!isRecord(body)) return undefined
  const snapshots = body.quota_snapshots
  if (!isRecord(snapshots)) return undefined
  const resetsAt =
    (typeof body.quota_reset_date_utc === "string" && body.quota_reset_date_utc) ||
    (typeof body.quota_reset_date === "string" ? body.quota_reset_date : undefined)
  for (const id of WINDOW_IDS) {
    const window = snapshots[id]
    if (!isRecord(window)) continue
    const usage = toUsage(window, resetsAt)
    if (usage) return usage
  }
  return undefined
}

function toUsage(window: Record<string, unknown>, resetsAt: string | undefined): Usage | undefined {
  const reset = resetsAt ? { resetsAt } : {}
  if (window.unlimited === true) {
    return { usedPercent: 0, remaining: 0, entitlement: 0, unlimited: true, ...reset }
  }
  if (window.has_quota === false) return undefined
  const entitlement = asNumber(window.entitlement)
  if (entitlement !== undefined && entitlement <= 0) return undefined
  const remaining = asNumber(window.remaining)
  let percent: number | undefined
  if (entitlement !== undefined && remaining !== undefined) {
    percent = (1 - remaining / entitlement) * 100
  } else if (typeof window.percent_remaining === "number") {
    percent = 100 - window.percent_remaining
  }
  if (percent === undefined || !Number.isFinite(percent)) return undefined
  return {
    usedPercent: Math.min(100, Math.max(0, Math.round(percent))),
    remaining: remaining ?? 0,
    entitlement: entitlement ?? 0,
    unlimited: false,
    ...reset,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}
