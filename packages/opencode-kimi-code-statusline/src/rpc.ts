import { Rpc } from "@opencode/plugin/rpc";
import type { Usage } from "./usage";

export type { Usage, UsageWindow } from "./usage";

/** Usage per Kimi For Coding plan, keyed by its integration (and provider) id. */
export type Usages = Partial<Record<"kimi-code-plan-global" | "kimi-code-plan-cn", Usage>>;

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

const usagesSchema = {
  type: "object",
  properties: {
    "kimi-code-plan-global": usageSchema,
    "kimi-code-plan-cn": usageSchema,
  },
  additionalProperties: false,
};

export const UsageRpc = Rpc.define({
  id: "opencode-kimi-code-statusline",
  methods: {
    get: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: {
        type: "object",
        properties: { usages: usagesSchema, language: { type: "string" } },
        additionalProperties: false,
      },
    },
  },
  events: {},
});
