import { Rpc } from "@opencode/plugin/rpc";

export type { Usage, UsageWindow } from "./usage";

const windowSchema = {
  type: "object",
  properties: {
    percent: { type: "number" },
    resetsAt: { type: "string" },
  },
  required: ["percent"],
  additionalProperties: false,
};

const usageSchema = {
  type: "object",
  properties: {
    rolling: windowSchema,
    weekly: windowSchema,
  },
  required: ["rolling", "weekly"],
  additionalProperties: false,
};

export const UsageRpc = Rpc.define({
  id: "opencode-kimi-code-statusline",
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
