import { Plugin } from "@opencode/plugin";
import { createUsageCache } from "core/usage-cache";
import { UsageRpc } from "./rpc";
import { parseUsage, type Usage } from "./usage";

const INTEGRATION_ID = "github-copilot";
const GITHUB_API = "https://api.github.com";
const API_VERSION = "2025-04-01";
const FETCH_TIMEOUT_MS = 10000;

// GitHub Enterprise credentials store the host (no scheme); the quota endpoint
// lives on the enterprise API host, mirroring OpenCode's own device flow.
function apiBase(credential: { metadata?: Record<string, unknown> }): string {
  const enterprise = credential.metadata?.enterpriseUrl;
  if (typeof enterprise === "string" && enterprise) {
    return `https://api.${enterprise.replace(/\/+$/, "")}`;
  }
  return GITHUB_API;
}

export default Plugin.define({
  id: "opencode-copilot-statusline",
  async setup(ctx) {
    async function fetchUsage(): Promise<Usage | undefined> {
      try {
        const connection = await ctx.integration.connection.active(INTEGRATION_ID);
        if (!connection) return undefined;
        const credential = await ctx.integration.connection.resolve(connection);
        // The device flow stores the GitHub token as an OAuth credential
        // (`access` and `refresh` both hold it). An environment connection
        // (`GITHUB_TOKEN`) resolves to a `key` credential instead.
        if (credential?.type !== "oauth" && credential?.type !== "key") return undefined;
        const token =
          credential.type === "oauth" ? credential.access || credential.refresh : credential.key;
        if (!token) return undefined;
        const res = await fetch(`${apiBase(credential)}/copilot_internal/user`, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
            "X-GitHub-Api-Version": API_VERSION,
            "User-Agent": "opencode-copilot-statusline",
          },
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
        return usage ? { usage } : {};
      },
    });
  },
});
