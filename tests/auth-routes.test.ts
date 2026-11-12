import { expect, test } from "bun:test";

import { isAllowedAuthRoute } from "../src/server/auth-routes";

test("allows the routes the browser needs to sign in and out", () => {
	expect(isAllowedAuthRoute("POST", "/api/auth/sign-in/social")).toBe(true);
	expect(isAllowedAuthRoute("GET", "/api/auth/callback/github")).toBe(true);
	expect(isAllowedAuthRoute("POST", "/api/auth/sign-out")).toBe(true);
	expect(isAllowedAuthRoute("GET", "/api/auth/error")).toBe(true);
	expect(isAllowedAuthRoute("post", "/api/auth/sign-out/")).toBe(true);
});

test("refuses the endpoints that would return the GitHub token to the page", () => {
	expect(isAllowedAuthRoute("POST", "/api/auth/get-access-token")).toBe(false);
	expect(isAllowedAuthRoute("POST", "/api/auth/refresh-token")).toBe(false);
	expect(isAllowedAuthRoute("GET", "/api/auth/account-info")).toBe(false);
});

test("refuses every other built-in account and session endpoint", () => {
	for (const [method, path] of [
		["GET", "/api/auth/get-session"],
		["GET", "/api/auth/list-accounts"],
		["POST", "/api/auth/update-user"],
		["POST", "/api/auth/delete-user"],
		["POST", "/api/auth/link-social"],
		["POST", "/api/auth/unlink-account"],
		["POST", "/api/auth/sign-up/email"],
		["POST", "/api/auth/sign-in/email"],
		["POST", "/api/auth/change-email"],
		["GET", "/api/auth/callback/google"],
	] as const) {
		expect(isAllowedAuthRoute(method, path)).toBe(false);
	}
});

test("matches the method as well as the path", () => {
	expect(isAllowedAuthRoute("GET", "/api/auth/sign-in/social")).toBe(false);
	expect(isAllowedAuthRoute("GET", "/api/auth/sign-out")).toBe(false);
	expect(isAllowedAuthRoute("POST", "/api/auth/callback/github")).toBe(false);
});

test("does not match lookalike or nested paths", () => {
	expect(isAllowedAuthRoute("POST", "/api/authx/sign-out")).toBe(false);
	expect(isAllowedAuthRoute("POST", "/api/auth/sign-out/extra")).toBe(false);
	expect(isAllowedAuthRoute("POST", "/api/auth")).toBe(false);
	expect(isAllowedAuthRoute("POST", "/sign-out")).toBe(false);
});
