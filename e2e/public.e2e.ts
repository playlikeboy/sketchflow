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

	test("opens the app without an account", async ({ page }) => {
		await mockApi(page, { signedIn: false });
		await page.goto("/");
		await page.getByRole("link", { name: "Open Sketchflow" }).first().click();
		await expect(page).toHaveURL(/\/app$/);
		await expect(page.getByText("On this device", { exact: true })).toBeVisible();
	});
});

test("help explains the five state marks", async ({ page }) => {
	await page.goto("/help");
	for (const label of ["Synced", "Unsaved draft", "Local only", "Sync paused", "Sync failed"]) {
		await expect(page.locator("#states").getByText(label, { exact: true })).toBeVisible();
	}
});
