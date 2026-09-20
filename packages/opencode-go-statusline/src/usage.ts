// Mapping from the OpenCode Go usage API to the statusline usage value.
//
// `GET /zen/go/v1/usage` returns `{ usage: { rolling, weekly, monthly } }`,
// each window `{ status, percent, resetsAt }` — the exact shape the RPC output
// schema declares. Responses that do not match are rejected so the statusline
// falls back to `Go —` instead of rendering a malformed percentage.
export type UsageWindow = {
  /** Window status as reported by the API (`ok` when healthy). */
  status: string;
  /** Used percentage of the window, 0-100. */
  percent: number;
  /** Window reset timestamp (ISO 8601). */
  resetsAt: string;
};

export type Usage = {
  /** Rolling 5-hour window. */
  rolling: UsageWindow;
  /** Weekly window. */
  weekly: UsageWindow;
  /** Monthly window. */
  monthly: UsageWindow;
};

export function parseUsage(body: unknown): Usage | undefined {
  if (!isRecord(body)) return undefined;
  const usage = isRecord(body.usage) ? body.usage : undefined;
  if (!usage) return undefined;
  const rolling = parseWindow(usage.rolling);
  const weekly = parseWindow(usage.weekly);
  const monthly = parseWindow(usage.monthly);
  if (!rolling || !weekly || !monthly) return undefined;
  return { rolling, weekly, monthly };
}

function parseWindow(value: unknown): UsageWindow | undefined {
  if (!isRecord(value)) return undefined;
  const { status, percent, resetsAt } = value;
  if (typeof status !== "string") return undefined;
  if (typeof percent !== "number" || !Number.isFinite(percent)) return undefined;
  if (typeof resetsAt !== "string" || resetsAt === "") return undefined;
  return { status, percent, resetsAt };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
