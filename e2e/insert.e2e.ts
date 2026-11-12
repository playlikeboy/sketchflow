import { expect, test, type Page } from "@playwright/test";

import { mockApi } from "./fixtures";

type SavedScene = { elements: { type: string; isDeleted?: boolean }[]; files: Record<string, unknown> };

/** Reads the sketch as it is saved in this browser, the same record the editor loads on reload. */
async function readSavedScene(page: Page): Promise<SavedScene> {
	return page.evaluate(async () => {
		const [, projectId, sketchId] = location.pathname.match(/projects\/([^/]+)\/sketches\/([^/]+)/) ?? [];
		const key = `sketchflow:local:local:${projectId}:${sketchId}`;
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open("sketchflow");
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		const record = await new Promise<{ value?: { scene?: { elements?: unknown[]; files?: Record<string, unknown> } } } | undefined>((resolve, reject) => {
			const request = db.transaction("drafts", "readonly").objectStore("drafts").get(key);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		db.close();
		const scene = record?.value?.scene;
		return {
			elements: (scene?.elements ?? []) as { type: string; isDeleted?: boolean }[],
			files: scene?.files ?? {},
		};
	});
}

async function liveElements(page: Page) {
	return (await readSavedScene(page)).elements.filter((element) => !element.isDeleted);
}

async function openGuestEditor(page: Page, title: string) {
	await mockApi(page, { signedIn: false });
	await page.goto("/app");
	await page.getByLabel("Title").fill(title);
	await page.getByRole("button", { name: "Create project" }).click();
	await expect(page.locator(".excalidraw canvas").first()).toBeVisible({ timeout: 30_000 });
}

function insertPanel(page: Page) {
	return page.getByRole("complementary", { name: "Insert" });
}

test.describe("insert panel", () => {
	test("offers every source, and a starter diagram is saved with the sketch", async ({ page }) => {
		await openGuestEditor(page, "Insert check");
		await page.getByRole("button", { name: "Insert", exact: true }).click();
		const panel = insertPanel(page);

		await expect(panel.getByRole("tab")).toHaveText(["Libraries", "Diagrams", "Logos", "Photos", "Stickers", "Upload"]);

		await panel.getByRole("tab", { name: "Diagrams" }).click();
		await panel.getByRole("button", { name: /Flowchart/ }).first().click();
		await expect(panel.getByText("Added Flowchart")).toBeVisible({ timeout: 20_000 });

		// Not just drawn: the autosaved sketch has the shapes and bound arrows.
		await expect.poll(async () => (await liveElements(page)).length, { timeout: 10_000 }).toBeGreaterThan(8);
		const saved = await liveElements(page);
		expect(saved.some((element) => element.type === "arrow")).toBe(true);

		await page.reload();
		await expect(page.locator(".excalidraw canvas").first()).toBeVisible({ timeout: 30_000 });
		expect((await liveElements(page)).length).toBe(saved.length);
	});

	test("an uploaded image is stored inside the sketch and survives a reload", async ({ page }) => {
		await openGuestEditor(page, "Upload check");
		await page.getByRole("button", { name: "Insert", exact: true }).click();
		const panel = insertPanel(page);

		await panel.getByRole("tab", { name: "Upload" }).click();
		await panel.locator('input[type="file"]').setInputFiles("public/pwa-192.png");
		await expect(panel.getByText("Added pwa-192.png")).toBeVisible({ timeout: 20_000 });

		await expect
			.poll(async () => {
				const scene = await readSavedScene(page);
				return scene.elements.filter((element) => element.type === "image" && !element.isDeleted).length === 1 && Object.keys(scene.files).length === 1;
			}, { timeout: 10_000 })
			.toBe(true);

		await page.reload();
		await expect(page.locator(".excalidraw canvas").first()).toBeVisible({ timeout: 30_000 });
		const afterReload = await readSavedScene(page);
		expect(afterReload.elements.filter((element) => element.type === "image" && !element.isDeleted)).toHaveLength(1);
		expect(Object.keys(afterReload.files)).toHaveLength(1);
	});

	test("two inserts in a row do not land on exactly the same spot", async ({ page }) => {
		await openGuestEditor(page, "Cascade check");
		await page.getByRole("button", { name: "Insert", exact: true }).click();
		const panel = insertPanel(page);
		await panel.getByRole("tab", { name: "Upload" }).click();

		await panel.locator('input[type="file"]').setInputFiles("public/pwa-192.png");
		await expect(panel.getByText("Added pwa-192.png")).toBeVisible({ timeout: 20_000 });
		await panel.locator('input[type="file"]').setInputFiles("public/pwa-512.png");
		await expect(panel.getByText("Added pwa-512.png")).toBeVisible({ timeout: 20_000 });

		await expect.poll(async () => (await liveElements(page)).length, { timeout: 10_000 }).toBe(2);
		const [first, second] = (await readSavedScene(page)).elements as unknown as { x: number; y: number; width: number; height: number }[];
		const centre = (element: { x: number; y: number; width: number; height: number }) => ({ x: element.x + element.width / 2, y: element.y + element.height / 2 });
		expect(Math.abs(centre(first).x - centre(second).x)).toBeGreaterThan(8);
		expect(Math.abs(centre(first).y - centre(second).y)).toBeGreaterThan(8);
	});
});

test.describe("canvas tools", () => {
	test("a plus handle on a selected shape adds a connected shape", async ({ page }) => {
		await openGuestEditor(page, "Connect check");
		const canvas = page.locator(".excalidraw canvas").last();
		const box = (await canvas.boundingBox()) as { x: number; y: number };

		// Give the canvas keyboard focus before choosing the rectangle tool.
		await page.mouse.click(box.x + 60, box.y + 420);
		await page.keyboard.press("r");
		await page.mouse.move(box.x + 160, box.y + 220);
		await page.mouse.down();
		await page.mouse.move(box.x + 280, box.y + 290, { steps: 6 });
		await page.mouse.up();

		await expect(page.getByRole("button", { name: /Add a connected shape/ })).toHaveCount(4);
		await page.getByRole("button", { name: /Add a connected shape to the right/ }).click();

		await expect
			.poll(async () => (await liveElements(page)).map((element) => element.type).sort().join(","), { timeout: 10_000 })
			.toBe("arrow,rectangle,rectangle");
	});

	test("present shows the sketch as a slide and Escape returns to editing", async ({ page }) => {
		await openGuestEditor(page, "Present check");
		await page.getByRole("button", { name: "Present", exact: true }).click();

		await expect(page.getByRole("button", { name: /Exit/ })).toBeVisible();
		await page.keyboard.press("Escape");

		await expect(page.getByRole("button", { name: /Exit/ })).toHaveCount(0);
		await expect(page.getByRole("button", { name: "Insert", exact: true })).toBeVisible();
	});
});
