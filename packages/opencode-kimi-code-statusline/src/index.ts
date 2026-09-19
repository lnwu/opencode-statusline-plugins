import { Plugin } from "@opencode/plugin";
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
const FETCH_TIMEOUT_MS = 10000;

export default Plugin.define({
  id: "opencode-kimi-code-statusline",
  async setup(ctx) {
    const language = ctx.options.language;

    async function fetchUsage(): Promise<Usage | undefined> {
      try {
        for (const integration of INTEGRATIONS) {
          const connection = await ctx.integration.connection.active(integration.id);
          if (!connection) continue;
          const credential = await ctx.integration.connection.resolve(connection);
          if (credential?.type !== "key" || !credential.key) continue;
          const res = await fetch(`${integration.base}/coding/v1/usages`, {
            headers: { Authorization: `Bearer ${credential.key}`, Accept: "application/json" },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          });
          if (!res.ok) continue;
          const usage = parseUsage(await res.json());
          if (usage) return usage;
        }
        return undefined;
      } catch {
        return undefined;
      }
    }

    await ctx.rpc.register(UsageRpc, {
      get: async () => {
        const usage = await fetchUsage();
        return {
          ...(usage ? { usage } : {}),
          ...(typeof language === "string" ? { language } : {}),
        };
      },
    });
  },
});
