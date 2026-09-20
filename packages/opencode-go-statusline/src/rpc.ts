import { Rpc } from "@opencode/plugin/rpc";

export type { Usage, UsageWindow } from "./usage";

const windowSchema = {
  type: "object",
  properties: {
    status: { type: "string" },
    percent: { type: "number" },
    resetsAt: { type: "string" },
  },
  required: ["status", "percent", "resetsAt"],
  additionalProperties: false,
};

const usageSchema = {
  type: "object",
  properties: {
    rolling: windowSchema,
    weekly: windowSchema,
    monthly: windowSchema,
  },
  required: ["rolling", "weekly", "monthly"],
  additionalProperties: false,
};

export const UsageRpc = Rpc.define({
  id: "opencode-go-statusline",
  methods: {
    get: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: {
        type: "object",
        properties: { usage: usageSchema, language: { type: "string" } },
        additionalProperties: false,
      },
    },
  },
  events: {},
});
