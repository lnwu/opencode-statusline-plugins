import { expect, test } from "bun:test";
import { connectionLabel, displayAccount, type ConnectionSlice } from "../src/account";

const credential = (label: string): ConnectionSlice => ({ type: "credential", id: label, label });
const env: ConnectionSlice = { type: "env", name: "GITHUB_TOKEN" };

test("shows the label when several credentials are connected", () => {
  expect(displayAccount(credential("work"), [credential("work"), credential("personal")])).toBe(
    "work",
  );
});

test("hides the label with a single credential", () => {
  expect(displayAccount(credential("work"), [credential("work")])).toBeUndefined();
});

test("hides the label for an environment connection", () => {
  expect(displayAccount(env, [env, credential("work")])).toBeUndefined();
});

test("does not count an environment connection as a labelled account", () => {
  expect(displayAccount(credential("work"), [credential("work"), env])).toBeUndefined();
});

test("keeps the label when the connection list cannot be read", () => {
  expect(displayAccount(credential("work"), undefined)).toBe("work");
});

test("treats a blank credential label as unlabelled", () => {
  expect(connectionLabel({ type: "credential", id: "x", label: "  " })).toBeUndefined();
  expect(
    displayAccount({ type: "credential", id: "x", label: "" }, [
      { type: "credential", id: "x", label: "" },
      credential("work"),
    ]),
  ).toBeUndefined();
});
