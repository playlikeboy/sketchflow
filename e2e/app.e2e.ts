import { expect, test } from "@playwright/test";

import { editorPath, mockApi } from "./fixtures";

test.describe("projects", () => {
	test("lists projects with folder, date and state, and filters by search", async ({ page }) => {
		await mockApi(page);
		await page.goto("/app");

		const rows = page.locator("tbody tr");
		await expect(rows).toHaveCount(3);
		const payments = rows.filter({ hasText: "Payments architecture" });
		await expect(payments).toContainText("projects/payments-architecture");
		await expect(payments).toContainText("Synced");

		await page.getByRole("searchbox", { name: "Search projects" }).fill("photosynthesis");
		await expect(rows).toHaveCount(1);

		await page.getByRole("searchbox", { name: "Search projects" }).fill("nothing-matches-this");
		await expect(page.getByRole("heading", { name: "No projects match that search" })).toBeVisible();
	});

	test("explains how to start when there is no workspace", async ({ page }) => {
		await mockApi(page, { noWorkspaces: true });
		await page.goto("/app");
		await expect(page.getByRole("heading", { name: "Connect a repository to start" })).toBeVisible();
		await expect(page.getByRole("link", { name: "Set up a workspace" })).toHaveAttribute("href", "/app/workspace?new=1");
	});

	test("private projects have no share or embed links", async ({ page }) => {
		await mockApi(page);
		await page.goto("/app");
		const row = page.locator("tbody tr").filter({ hasText: "Onboarding flow" });
		await expect(row).toContainText("Private");
		await expect(row.getByRole("link", { name: /Share page/ })).toHaveCount(0);
	});
});

test.describe("editor", () => {
	test("names the project and shows where it lives", async ({ page }) => {
		await mockApi(page);
		await page.goto(editorPath);

		const title = page.getByRole("button", { name: "Payments architecture" });
		await expect(title).toBeVisible({ timeout: 20_000 });
		await title.click();

		const block = page.locator("#sheet-title-block");
		await expect(block).toContainText("demo-user/sketchflow-workspace");
		await expect(block).toContainText("projects/payments-architecture");
		await expect(block).toContainText("main @ 7f2a1b9");
		await expect(block).toContainText("docs/notes.md");
	});

	test("history lists commits and previews one read-only", async ({ page }) => {
		await mockApi(page);
		await page.goto(editorPath);
		await expect(page.locator(".excalidraw canvas").first()).toBeVisible({ timeout: 20_000 });

		await page.getByRole("button", { name: "History" }).click();
		const items = page.getByRole("listitem").filter({ hasText: /Add cache|Add queue|First system map/ });
		await expect(items).toHaveCount(3);
		await expect(items.first()).toContainText("Latest");
		// The newest version is what is already on screen, so it cannot be restored onto itself.
		await expect(items.first().getByRole("button", { name: "Restore" })).toHaveCount(0);

		await items.nth(1).getByRole("button", { name: "Preview" }).click();
		await expect(page.getByText(/Previewing 3c8d4e2/)).toBeVisible();
		await page.getByRole("button", { name: "Back to current" }).click();
		await expect(page.getByText(/Previewing/)).toHaveCount(0);
	});
});
