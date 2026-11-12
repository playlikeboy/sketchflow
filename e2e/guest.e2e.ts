import { expect, test, type Page } from "@playwright/test";

import { mockApi, type ApiLog } from "./fixtures";

/** Calls that only a signed-in user may make. A guest session must never issue one. */
function authenticatedCalls(log: ApiLog) {
	return log.filter((call) => call.path.startsWith("/api/workspaces") || call.path === "/api/github/status");
}

async function createGuestProject(page: Page, title: string) {
	await page.goto("/app");
	await page.getByLabel("Title").fill(title);
	await page.getByRole("button", { name: "Create project" }).click();
	await expect(page).toHaveURL(/\/app\/workspaces\/local\/projects\/[^/]+\/sketches\//);
	await expect(page.locator(".excalidraw canvas").first()).toBeVisible({ timeout: 30_000 });
}

test.describe("without an account", () => {
	test("the app opens on this device instead of asking to sign in", async ({ page }) => {
		const log = await mockApi(page, { signedIn: false });
		await page.goto("/app");

		await expect(page).toHaveURL(/\/app$/);
		await expect(page.getByText("On this device", { exact: true })).toBeVisible();
		await expect(page.getByRole("heading", { name: "New project" })).toBeVisible();
		await expect(page.getByRole("link", { name: "Sign in with GitHub" })).toHaveAttribute("href", "/sign-in");
		expect(authenticatedCalls(log)).toHaveLength(0);
	});

	test("a project can be created, drawn in and found again after a reload", async ({ page }) => {
		const log = await mockApi(page, { signedIn: false });
		await createGuestProject(page, "Kitchen plan");

		await expect(page.getByText(/Saved on this device/)).toBeVisible();
		const notes = page.locator(".sketchflow-doc-editor [contenteditable='true']").first();
		await expect(notes).toContainText("Kitchen plan", { timeout: 20_000 });
		await notes.click();
		await page.keyboard.press("Control+End");
		await page.keyboard.type(" Measure the window first.");
		await page.waitForTimeout(1_200);

		await page.reload();
		await expect(page.locator(".sketchflow-doc-editor [contenteditable='true']").first()).toContainText("Measure the window first.", {
			timeout: 20_000,
		});

		await page.goto("/app");
		await expect(page.getByRole("link", { name: /Kitchen plan/ }).first()).toBeVisible();
		expect(authenticatedCalls(log)).toHaveLength(0);
	});

	test("sharing asks for GitHub instead of redirecting", async ({ page }) => {
		await mockApi(page, { signedIn: false });
		await page.goto("/app/public");

		await expect(page).toHaveURL(/\/app\/public$/);
		await expect(page.getByRole("heading", { name: "Sharing needs GitHub" })).toBeVisible();
	});

	test("the old try page opens the app", async ({ page }) => {
		await mockApi(page, { signedIn: false });
		await page.goto("/try");

		await expect(page).toHaveURL(/\/app$/);
	});

	test("the workspaces page offers to connect GitHub without requiring it", async ({ page }) => {
		const log = await mockApi(page, { signedIn: false });
		await page.goto("/app/workspace");

		await expect(page).toHaveURL(/\/app\/workspace$/);
		await expect(page.getByRole("button", { name: "Connect GitHub" })).toBeVisible();
		await expect(page.getByText("This device").first()).toBeVisible();
		expect(authenticatedCalls(log)).toHaveLength(0);
	});
});

test.describe("after connecting GitHub", () => {
	test("projects made on this device can be copied into the repository", async ({ page }) => {
		await mockApi(page, { signedIn: false });
		await createGuestProject(page, "Roadmap");

		// The same browser, now signed in.
		const log = await mockApi(page, { signedIn: true });
		await page.goto("/app");

		await expect(page.getByRole("heading", { name: "1 project on this device isn't backed up" })).toBeVisible({ timeout: 20_000 });
		await page.getByRole("button", { name: "Sync to demo-user/sketchflow-workspace" }).click();
		await expect(page.getByText("Synced 1 project.")).toBeVisible({ timeout: 20_000 });

		const commit = log.find((call) => call.method === "POST" && call.path === "/api/workspaces/ws-1/commit");
		const files = ((commit?.body as { files?: { path: string }[] } | undefined)?.files ?? []).map((file) => file.path);
		expect(files).toContain("projects/roadmap/project.json");
		expect(files).toContain("projects/roadmap/sketches/system-map.excalidraw.json");
		expect(files).toContain("projects/roadmap/docs/notes.md");
		expect(files).toContain("projects/projects-metadata.json");

		// Once it is in the repository it is no longer waiting on this device.
		await page.reload();
		await expect(page.getByRole("heading", { name: /on this device isn't backed up/ })).toHaveCount(0);
	});
});
