import { expect, test } from "bun:test";

import { safeReturnPath, signInPath } from "../src/lib/return-path";

test("keeps a path on this site, including its query string", () => {
	expect(safeReturnPath("/app/workspace?new=1")).toBe("/app/workspace?new=1");
});

test("falls back to the app when nothing was asked for", () => {
	expect(safeReturnPath(null)).toBe("/app");
	expect(safeReturnPath("")).toBe("/app");
});

test("refuses to return to another site", () => {
	expect(safeReturnPath("https://evil.example/app")).toBe("/app");
	expect(safeReturnPath("//evil.example/app")).toBe("/app");
	expect(safeReturnPath("/\\evil.example")).toBe("/app");
	expect(safeReturnPath("/app\n//evil.example")).toBe("/app");
	expect(safeReturnPath("javascript:alert(1)")).toBe("/app");
});

test("never returns to the sign-in page itself", () => {
	expect(safeReturnPath("/sign-in")).toBe("/app");
	expect(safeReturnPath("/sign-in?next=/sign-in")).toBe("/app");
});

test("builds a sign-in link that remembers where the user was", () => {
	expect(signInPath("/app/recent")).toBe("/sign-in?next=%2Fapp%2Frecent");
	expect(signInPath("/app")).toBe("/sign-in");
	expect(signInPath("https://evil.example")).toBe("/sign-in");
});
