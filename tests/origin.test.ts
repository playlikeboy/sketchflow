import { expect, test } from "bun:test";

import { assertSameOrigin } from "../src/server/origin";

function post(headers: Record<string, string>) {
  return new Request("https://sketchflow.space/api/workspaces/bootstrap", { method: "POST", headers });
}

test("allows same-origin requests", () => {
  expect(() => assertSameOrigin(post({ origin: "https://sketchflow.space", host: "sketchflow.space" }))).not.toThrow();
});

test("allows requests without an Origin header", () => {
  expect(() => assertSameOrigin(post({}))).not.toThrow();
});

test("rejects a foreign Origin", () => {
  expect(() => assertSameOrigin(post({ origin: "https://evil.example", host: "sketchflow.space" }))).toThrow();
});

test("rejects a lookalike host", () => {
  expect(() => assertSameOrigin(post({ origin: "https://sketchflow.space.evil.example" }))).toThrow();
});

test("rejects a malformed Origin", () => {
  expect(() => assertSameOrigin(post({ origin: "null" }))).toThrow();
});

test("rejects requests the browser marks as cross-site", () => {
  expect(() => assertSameOrigin(post({ "sec-fetch-site": "cross-site" }))).toThrow();
});
