// Server-side usage cache: collapse concurrent quota lookups into one
// upstream request and serve a recent success without refetching.
//
// The statusline polls the usage RPC about once a minute, and several TUI
// clients (or windows) can poll the same server. Wrapping a server plugin's
// fetch function with `createUsageCache` gives it:
//
// - a TTL: a success younger than `ttlMs` is served without a fetch, so N
//   clients cost at most one upstream request per TTL;
// - single-flight: concurrent calls share the in-flight request;
// - failure tolerance: a failing fetch returns the last known value (stale)
//   instead of throwing, or `undefined` when there has never been a success.
//
// The default TTL sits just under the TUI's polling interval, so a single
// client still sees fresh data on every poll while extra clients reuse it.
export const USAGE_CACHE_TTL_MS = 55_000;

export type UsageCacheOptions = {
  /** How long a success stays fresh; defaults to `USAGE_CACHE_TTL_MS`. */
  ttlMs?: number;
  /** Clock injection for tests; defaults to `Date.now`. */
  now?: () => number;
};

export function createUsageCache<T>(
  fetchUsage: () => Promise<T | undefined>,
  options: UsageCacheOptions = {},
): () => Promise<T | undefined> {
  const ttlMs = options.ttlMs ?? USAGE_CACHE_TTL_MS;
  const now = options.now ?? Date.now;
  let last: { at: number; value: T } | undefined;
  let inflight: Promise<T | undefined> | undefined;

  return async () => {
    if (last && now() - last.at < ttlMs) return last.value;
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const value = await fetchUsage();
        if (value === undefined) return last?.value;
        last = { at: now(), value };
        return value;
      } catch {
        return last?.value;
      } finally {
        inflight = undefined;
      }
    })();
    return inflight;
  };
}
