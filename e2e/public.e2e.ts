import { expect, test } from "@playwright/test";

import { mockApi } from "./fixtures";

test.describe("landing page", () => {
	test("the example sheet shows a draft becoming a commit", async ({ page }) => {
		await mockApi(page, { signedIn: false });
		await page.goto("/");

		await expect(page.getByRole("heading", { level: 1 })).toContainText("Keep the files");
		const sketchFile = page.getByRole("listitem").filter({ hasText: "sketches/system-map.excalidraw.json" }).first();
		await expect(sketchFile).toContainText("Synced");

		await page.getByRole("button", { name: "Edit" }).click();
		await expect(sketchFile).toContainText("Unsaved");

		await page.getByRole("button", { name: "Save", exact: true }).click();
		await expect(sketchFile).toContainText("Synced");
		await expect(page.getByText("Add cache in front of the database")).toBeVisible();
	});

	test("links to the no-account editor", async ({ page }) => {
		await mockApi(page, { signedIn: false });
		await page.goto("/");
		await page.getByRole("link", { name: "Try it without an account" }).click();
		await expect(page).toHaveURL(/\/try$/);
	});
});

test.describe("try it", () => {
	test("opens an editor without signing in and never calls the workspace API", async ({ page }) => {
		const log = await mockApi(page, { signedIn: false });
		await page.goto("/try");

		await expect(page.getByRole("heading", { name: "Scratch sketch" })).toBeVisible();
		await expect(page.locator(".excalidraw canvas").first()).toBeVisible({ timeout: 20_000 });
		await expect(page.getByText("In this browser", { exact: true })).toBeVisible();
		await expect(page.getByRole("button", { name: /Sign in/ })).toBeVisible();
		expect(log.filter((call) => call.path.startsWith("/api/workspaces"))).toHaveLength(0);
	});

	test("keeps notes across a reload", async ({ page }) => {
		await mockApi(page, { signedIn: false });
		await page.goto("/try");

		const editor = page.locator(".sketchflow-doc-editor [contenteditable='true']").first();
		await expect(editor).toContainText("My first sketch", { timeout: 20_000 });
		await editor.click();
		await page.keyboard.press("Control+End");
		await page.keyboard.type(" Remember the retry queue.");
		await page.waitForTimeout(1_000);

		await page.reload();
		await expect(page.locator(".sketchflow-doc-editor [contenteditable='true']").first()).toContainText("Remember the retry queue.", {
			timeout: 20_000,
		});
	});
});

test("help explains the five state marks", async ({ page }) => {
	await page.goto("/help");
	for (const label of ["Synced", "Unsaved draft", "Local only", "Sync paused", "Sync failed"]) {
		await expect(page.locator("#states").getByText(label, { exact: true })).toBeVisible();
	}
});
