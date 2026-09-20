import { expect, test } from "bun:test";
import { createUsageCache, USAGE_CACHE_TTL_MS } from "../src/usage-cache";

test("serves a success younger than the TTL without refetching", async () => {
  let clock = 0;
  let calls = 0;
  const getUsage = createUsageCache(
    async () => {
      calls += 1;
      return { percent: calls };
    },
    { ttlMs: 100, now: () => clock },
  );

  expect(await getUsage()).toEqual({ percent: 1 });
  clock = 99;
  expect(await getUsage()).toEqual({ percent: 1 });
  expect(calls).toBe(1);

  clock = 100;
  expect(await getUsage()).toEqual({ percent: 2 });
  expect(calls).toBe(2);
});

test("collapses concurrent calls into one request", async () => {
  let calls = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const getUsage = createUsageCache(async () => {
    calls += 1;
    await gate;
    return "usage";
  });

  const first = getUsage();
  const second = getUsage();
  release();
  expect(await first).toBe("usage");
  expect(await second).toBe("usage");
  expect(calls).toBe(1);
});

test("returns the last known value when a fetch fails", async () => {
  let fail = false;
  const getUsage = createUsageCache(
    async () => {
      if (fail) throw new Error("boom");
      return "usage";
    },
    { ttlMs: 0 },
  );

  expect(await getUsage()).toBe("usage");
  fail = true;
  expect(await getUsage()).toBe("usage");
});

test("returns undefined before the first success", async () => {
  const getUsage = createUsageCache(async () => undefined);
  expect(await getUsage()).toBeUndefined();
  expect(await getUsage()).toBeUndefined();
});

test("retries after a failed fetch instead of caching the failure", async () => {
  let calls = 0;
  let fail = true;
  const getUsage = createUsageCache(
    async () => {
      calls += 1;
      if (fail) throw new Error("boom");
      return "usage";
    },
    { ttlMs: 100, now: () => 0 },
  );

  expect(await getUsage()).toBeUndefined();
  fail = false;
  expect(await getUsage()).toBe("usage");
  expect(calls).toBe(2);
});

test("defaults the TTL to just under the polling interval", () => {
  expect(USAGE_CACHE_TTL_MS).toBeLessThan(60_000);
  expect(USAGE_CACHE_TTL_MS).toBeGreaterThan(0);
});
