import { expect, test } from "bun:test";
import { statusColors } from "../src/theme";

// Trimmed ResolvedTheme shapes: pre-2.0.9 (`default` / `subdued`) and 2.0.9+
// (`base` / `muted`), using strings in place of the RGBA values.
const OLD = {
  text: {
    default: "old-default",
    subdued: "old-subdued",
    feedback: { error: { default: "old-error" }, info: { default: "old-info" } },
  },
};

const NEW = {
  text: {
    base: "new-base",
    muted: "new-muted",
    feedback: {
      error: { base: "new-error", muted: "new-error-muted" },
      info: { base: "new-info" },
    },
  },
};

test("reads the 2.0.9 token names", () => {
  expect(statusColors<string>(NEW)).toEqual({
    muted: "new-muted",
    error: "new-error",
    info: "new-info",
  });
});

test("falls back to the pre-2.0.9 token names", () => {
  expect(statusColors<string>(OLD)).toEqual({
    muted: "old-subdued",
    error: "old-error",
    info: "old-info",
  });
});

test("prefers the 2.0.9 names when both are present", () => {
  const both = {
    text: {
      ...OLD.text,
      ...NEW.text,
      feedback: {
        error: { default: "old-error", base: "new-error" },
        info: { default: "old-info", base: "new-info" },
      },
    },
  };
  expect(statusColors<string>(both)).toEqual({
    muted: "new-muted",
    error: "new-error",
    info: "new-info",
  });
});

test("leaves tokens undefined when neither name exists", () => {
  expect(statusColors<string>({ text: {} })).toEqual({
    muted: undefined,
    error: undefined,
    info: undefined,
  });
  expect(statusColors<string>({ text: { feedback: {} } })).toEqual({
    muted: undefined,
    error: undefined,
    info: undefined,
  });
  expect(statusColors<string>(undefined)).toEqual({
    muted: undefined,
    error: undefined,
    info: undefined,
  });
});
