import { Plugin } from "@opencode/plugin";
import { createUsageCache } from "core/usage-cache";
import { displayAccount, type ConnectionSlice } from "./account";
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

function connectionKey(connection: ConnectionSlice): string {
  return `${connection.type}:${connection.id ?? connection.name ?? ""}`;
}

export default Plugin.define({
  id: "opencode-copilot-statusline",
  async setup(ctx) {
    type ConnectionInfo = Parameters<typeof ctx.integration.connection.resolve>[0];
    async function fetchUsage(connection: ConnectionInfo): Promise<Usage | undefined> {
      try {
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

    // The integration's connections, or `undefined` when they cannot be read
    // (the label is then kept, so an unknown account count never hides it).
    async function listConnections(): Promise<ConnectionSlice[] | undefined> {
      try {
        const info = await ctx.integration.get({ integrationID: INTEGRATION_ID });
        return info.data.connections;
      } catch {
        return undefined;
      }
    }

    // Cached per connection, so switching accounts never shows (or falls back
    // to) the previous account's quota.
    const connections = new Map<string, ConnectionInfo>();
    const getUsage = createUsageCache((key) => fetchUsage(connections.get(key!)!));

    await ctx.rpc.register(UsageRpc, {
      get: async () => {
        let connection: ConnectionInfo | undefined;
        try {
          connection = await ctx.integration.connection.active(INTEGRATION_ID);
        } catch {
          return {};
        }
        if (!connection) return {};
        const key = connectionKey(connection);
        connections.set(key, connection);
        const [usage, all] = await Promise.all([getUsage(key), listConnections()]);
        if (!usage) return {};
        // The label is added only when several Copilot accounts need telling
        // apart; a single account keeps the plain `Copilot` title.
        const account = displayAccount(connection, all);
        return { usage: account ? { ...usage, account } : usage };
      },
    });
  },
});
