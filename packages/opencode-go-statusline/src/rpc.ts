import { Rpc } from "@opencode/plugin/rpc"

export type UsageWindow = { status: string; percent: number; resetsAt: string }
export type Usage = { rolling: UsageWindow; weekly: UsageWindow; monthly: UsageWindow }

const windowSchema = {
  type: "object",
  properties: {
    status: { type: "string" },
    percent: { type: "number" },
    resetsAt: { type: "string" },
  },
  required: ["status", "percent", "resetsAt"],
  additionalProperties: false,
}

const usageSchema = {
  type: "object",
  properties: {
    rolling: windowSchema,
    weekly: windowSchema,
    monthly: windowSchema,
  },
  required: ["rolling", "weekly", "monthly"],
  additionalProperties: false,
}

export const UsageRpc = Rpc.define({
  id: "opencode-go-statusline",
  methods: {
    get: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: {
        type: "object",
        properties: { usage: usageSchema },
        additionalProperties: false,
      },
    },
  },
  events: {},
})
