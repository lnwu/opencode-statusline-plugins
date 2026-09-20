import { Plugin } from "@opencode/plugin";
import { createUsageCache } from "core/usage-cache";
import { UsageRpc } from "./rpc";
import { parseUsage, type Usage } from "./usage";

const USAGE_URL = "https://opencode.ai/zen/go/v1/usage";
const INTEGRATION_ID = "opencode-go";
const FETCH_TIMEOUT_MS = 10000;

export default Plugin.define({
  id: "opencode-go-statusline",
  async setup(ctx) {
    const language = ctx.options.language;

    async function fetchUsage(): Promise<Usage | undefined> {
      try {
        const connection = await ctx.integration.connection.active(INTEGRATION_ID);
        if (!connection) return undefined;
        const credential = await ctx.integration.connection.resolve(connection);
        if (credential?.type !== "key") return undefined;
        const res = await fetch(USAGE_URL, {
          headers: { Authorization: `Bearer ${credential.key}` },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) return undefined;
        return parseUsage(await res.json());
      } catch {
        return undefined;
      }
    }

    const getUsage = createUsageCache(fetchUsage);

    await ctx.rpc.register(UsageRpc, {
      get: async () => {
        const usage = await getUsage();
        return {
          ...(usage ? { usage } : {}),
          ...(typeof language === "string" ? { language } : {}),
        };
      },
    });
  },
});
