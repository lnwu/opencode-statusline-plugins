import { Plugin } from "@opencode/plugin"
import { UsageRpc, type Usage } from "./rpc"

const USAGE_URL = "https://opencode.ai/zen/go/v1/usage"
const INTEGRATION_ID = "opencode-go"
const FETCH_TIMEOUT_MS = 10000

export default Plugin.define({
  id: "opencode-go-statusline",
  async setup(ctx) {
    async function fetchUsage(): Promise<Usage | undefined> {
      try {
        const connection = await ctx.integration.connection.active(INTEGRATION_ID)
        if (!connection) return undefined
        const credential = await ctx.integration.connection.resolve(connection)
        if (credential?.type !== "key") return undefined
        const res = await fetch(USAGE_URL, {
          headers: { Authorization: `Bearer ${credential.key}` },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        })
        if (!res.ok) return undefined
        const body = (await res.json()) as { usage?: Usage }
        const usage = body?.usage
        if (!usage?.rolling || !usage?.weekly || !usage?.monthly) return undefined
        return usage
      } catch {
        return undefined
      }
    }

    await ctx.rpc.register(UsageRpc, {
      get: async () => {
        const usage = await fetchUsage()
        return usage ? { usage } : {}
      },
    })
  },
})
