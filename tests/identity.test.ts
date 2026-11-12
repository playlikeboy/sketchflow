import { expect, test } from "bun:test";

import { chooseAppUserId, githubDerivedUserId } from "../src/server/identity";

test("derives a stable id from the GitHub account for a first-time user", () => {
	expect(chooseAppUserId("12345", null)).toBe("github_12345");
	expect(githubDerivedUserId("12345")).toBe("github_12345");
});

test("keeps the existing account id when the GitHub account was connected before the auth migration", () => {
	expect(chooseAppUserId("12345", "3f0c8c1e-legacy-stack-user")).toBe("3f0c8c1e-legacy-stack-user");
});

test("accepts a recorded connection that points at the account's own derived id", () => {
	expect(chooseAppUserId("12345", "github_12345")).toBe("github_12345");
});

test("never hands one GitHub account the derived id of another", () => {
	expect(chooseAppUserId("12345", "github_99999")).toBe("github_12345");
});

test("rejects a GitHub account id that is not numeric", () => {
	expect(() => chooseAppUserId("", null)).toThrow();
	expect(() => chooseAppUserId("12345; drop", null)).toThrow();
	expect(() => githubDerivedUserId("abc")).toThrow();
});
