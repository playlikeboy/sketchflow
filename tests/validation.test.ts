import { expect, test } from "bun:test";

import { BadRequestError } from "../src/server/errors";
import { isJsonObject, optionalBoolean, optionalString, requiredString } from "../src/server/validation";

test("isJsonObject accepts only plain objects", () => {
  expect(isJsonObject({})).toBe(true);
  expect(isJsonObject([])).toBe(false);
  expect(isJsonObject(null)).toBe(false);
  expect(isJsonObject("x")).toBe(false);
});

test("requiredString trims and rejects blanks and non-strings", () => {
  expect(requiredString({ name: "  demo  " }, "name")).toBe("demo");
  expect(() => requiredString({ name: "   " }, "name")).toThrow(BadRequestError);
  expect(() => requiredString({ name: 5 }, "name")).toThrow(BadRequestError);
  expect(() => requiredString({}, "name")).toThrow(BadRequestError);
});

test("optionalString returns undefined when absent and rejects wrong types", () => {
  expect(optionalString({}, "branch")).toBeUndefined();
  expect(optionalString({ branch: null }, "branch")).toBeUndefined();
  expect(optionalString({ branch: " main " }, "branch")).toBe("main");
  expect(() => optionalString({ branch: ["main"] }, "branch")).toThrow(BadRequestError);
});

test("optionalBoolean rejects truthy non-booleans", () => {
  expect(optionalBoolean({ private: true }, "private")).toBe(true);
  expect(optionalBoolean({}, "private")).toBeUndefined();
  expect(() => optionalBoolean({ private: "true" }, "private")).toThrow(BadRequestError);
});
