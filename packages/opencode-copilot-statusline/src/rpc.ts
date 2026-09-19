import { Rpc } from "@opencode/plugin/rpc";

export type { Usage } from "./usage";

const usageSchema = {
  type: "object",
  properties: {
    usedPercent: { type: "number" },
    remaining: { type: "number" },
    entitlement: { type: "number" },
    unlimited: { type: "boolean" },
    resetsAt: { type: "string" },
  },
  required: ["usedPercent", "remaining", "entitlement", "unlimited"],
  additionalProperties: false,
};

export const UsageRpc = Rpc.define({
  id: "opencode-copilot-statusline",
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
});
