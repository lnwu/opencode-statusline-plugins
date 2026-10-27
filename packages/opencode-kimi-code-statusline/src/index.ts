import { Plugin } from "@opencode/plugin";
import { createUsageCache } from "core/usage-cache";
import { UsageRpc, type Usage } from "./rpc";
import { parseUsage } from "./usage";

// Kimi For Coding ships as two integrations (and matching provider ids) that
// declare the same `KIMI_API_KEY` env method but live on different hosts:
// kimi.ai for the global plan, kimi.com for the CN plan. The stored
// credential is an API key either way (`type: "key"`). The tests register the
// live key as `KIMI_API_KEY`, the name the integration declares.
const INTEGRATIONS = [
  { id: "kimi-code-plan-global", base: "https://api.kimi.ai" },
  { id: "kimi-code-plan-cn", base: "https://api.kimi.com" },
] as const;
type Integration = (typeof INTEGRATIONS)[number];
const FETCH_TIMEOUT_MS = 10000;

export default Plugin.define({
  id: "opencode-kimi-code-statusline",
  async setup(ctx) {
    const language = ctx.options.language;

    // Each plan has its own account and quota, so they are fetched and cached
    // separately: the TUI shows the plan the session runs on. A failure on one
    // host never hides the other plan's quota.
    async function fetchUsage(integration: Integration): Promise<Usage | undefined> {
      try {
        const connection = await ctx.integration.connection.active(integration.id);
        if (!connection) return undefined;
        const credential = await ctx.integration.connection.resolve(connection);
        if (credential?.type !== "key" || !credential.key) return undefined;
        const res = await fetch(`${integration.base}/coding/v1/usages`, {
          headers: { Authorization: `Bearer ${credential.key}`, Accept: "application/json" },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) return undefined;
        return parseUsage(await res.json());
      } catch {
        return undefined;
      }
    }

    const getUsage = createUsageCache((id) =>
      fetchUsage(INTEGRATIONS.find((integration) => integration.id === id)!),
    );

    await ctx.rpc.register(UsageRpc, {
      get: async () => {
        const results = await Promise.all(
          INTEGRATIONS.map(async ({ id }) => [id, await getUsage(id)] as const),
        );
        const usages = Object.fromEntries(results.filter(([, usage]) => usage));
        return {
          ...(Object.keys(usages).length ? { usages } : {}),
          ...(typeof language === "string" ? { language } : {}),
        };
      },
    });
  },
});
