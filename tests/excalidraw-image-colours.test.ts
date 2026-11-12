import { expect, test } from "bun:test";

import { EXCALIDRAW_IMAGE_INVERT_FILTER, resolveCanvasFilter } from "../src/lib/excalidraw-image-colours";

test("drops the pre-inversion Excalidraw applies to photos in dark theme", () => {
	expect(resolveCanvasFilter(EXCALIDRAW_IMAGE_INVERT_FILTER)).toBe("none");
});

test("leaves every other canvas filter untouched", () => {
	expect(resolveCanvasFilter("none")).toBe("none");
	expect(resolveCanvasFilter("blur(4px)")).toBe("blur(4px)");
	expect(resolveCanvasFilter("invert(93%) hue-rotate(180deg)")).toBe("invert(93%) hue-rotate(180deg)");
});

test("matches the filter string in the installed Excalidraw, so an upgrade that changes it fails here", async () => {
	const { Glob } = await import("bun");
	const chunks = [...new Glob("node_modules/@excalidraw/excalidraw/dist/dev/*.js").scanSync(".")];
	const sources = await Promise.all(chunks.map((chunk) => Bun.file(chunk).text()));

	expect(sources.some((source) => source.includes(`IMAGE_INVERT_FILTER = "${EXCALIDRAW_IMAGE_INVERT_FILTER}"`))).toBe(true);
});
