// Mapping from the Kimi For Coding usage API to the statusline usage value.
//
// `GET /coding/v1/usages` returns the subscription's two quota windows: a
// rolling 5-hour window and the weekly window. Each window appears twice — as
// absolute numbers (`limits[].detail` for the rolling window, `usage` for the
// weekly one) and as a precise pre-computed ratio (`usages.limit_5h` /
// `usages.limit_7d`). The ratios are preferred; the absolute numbers are the
// fallback. All numeric fields are JSON strings on the wire (`"100"`).
//
// The rolling window is identified by its 300-minute `window` length. The
// response also carries a `booster_wallet` top-up balance, which OpenCode
// never draws from, so it is ignored.
export type UsageWindow = {
  /** Used percentage of the window, 0-100. */
  percent: number;
  /** Window reset timestamp (ISO 8601), when reported. */
  resetsAt?: string;
};

export type Usage = {
  /** Rolling 5-hour window. */
  rolling: UsageWindow;
  /** Weekly window. */
  weekly: UsageWindow;
};

const ROLLING_WINDOW_MINUTES = 300;

export function parseUsage(body: unknown): Usage | undefined {
  if (!isRecord(body)) return undefined;
  const usages = isRecord(body.usages) ? body.usages : undefined;
  const rolling = (usages ? fromRatio(usages.limit_5h) : undefined) ?? fromLimits(body.limits);
  const weekly = (usages ? fromRatio(usages.limit_7d) : undefined) ?? fromAbsolute(body.usage);
  if (!rolling || !weekly) return undefined;
  return { rolling, weekly };
}

/** `usages.limit_5h` / `limit_7d`: `{ used_ratio, reset_time }`. */
function fromRatio(value: unknown): UsageWindow | undefined {
  if (!isRecord(value)) return undefined;
  const ratio = asNumber(value.used_ratio);
  if (ratio === undefined) return undefined;
  return window(ratio * 100, asString(value.reset_time));
}

/** `limits[]`: window entries carrying their length in `window`. */
function fromLimits(value: unknown): UsageWindow | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries = value.filter(isRecord);
  const rolling =
    entries.find((entry) => windowMinutes(entry) === ROLLING_WINDOW_MINUTES) ?? entries[0];
  return rolling ? fromAbsolute(rolling.detail) : undefined;
}

/** `limits[].detail` / `usage`: `{ limit, used, remaining, resetTime }`. */
function fromAbsolute(value: unknown): UsageWindow | undefined {
  if (!isRecord(value)) return undefined;
  const limit = asNumber(value.limit);
  const remaining = asNumber(value.remaining);
  if (limit === undefined || limit <= 0 || remaining === undefined) return undefined;
  return window(((limit - remaining) / limit) * 100, asString(value.resetTime));
}

function windowMinutes(entry: Record<string, unknown>): number | undefined {
  const window = entry.window;
  return isRecord(window) ? asNumber(window.duration) : undefined;
}

function window(percent: number, resetsAt: string | undefined): UsageWindow {
  const clamped = { percent: Math.round(Math.min(100, Math.max(0, percent))) };
  return resetsAt ? { ...clamped, resetsAt } : clamped;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The API serializes numbers as strings (`"100"`), so accept both. */
function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}
