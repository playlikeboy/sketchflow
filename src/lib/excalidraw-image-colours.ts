// Keeps photos and other raster images in their real colours on the dark canvas.
//
// Excalidraw's dark theme works in two halves: a CSS filter inverts the whole canvas, and
// raster images are drawn pre-inverted so that filter flips them back to normal. Sketchflow
// turns the CSS half off (see `.excalidraw.theme--dark` in globals.css) because its dark canvas
// is a true black with literal stroke colours. That leaves the pre-inversion with nothing to
// undo it, so every photo would show as a colour negative.
//
// The pre-inversion is a canvas `filter` set to one specific string. This swaps exactly that
// string for "none" and leaves every other filter alone. The image data in the sketch is never
// changed, so files still open correctly in Excalidraw itself.

/** `IMAGE_INVERT_FILTER` in @excalidraw/excalidraw 0.18. If an upgrade changes it, photos invert again. */
export const EXCALIDRAW_IMAGE_INVERT_FILTER = "invert(100%) hue-rotate(180deg) saturate(1.25)";

/** The filter to actually apply for a filter value Excalidraw asked for. */
export function resolveCanvasFilter(requested: string) {
	return requested === EXCALIDRAW_IMAGE_INVERT_FILTER ? "none" : requested;
}

let isInstalled = false;

/** Installs the fix once per page. Safe to call on the server and to call repeatedly. */
export function keepImageColoursOnDarkCanvas() {
	if (isInstalled || typeof CanvasRenderingContext2D === "undefined") return;

	const descriptor = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, "filter");
	const originalSet = descriptor?.set;
	if (!descriptor || !originalSet) return;

	Object.defineProperty(CanvasRenderingContext2D.prototype, "filter", {
		...descriptor,
		set(this: CanvasRenderingContext2D, value: string) {
			originalSet.call(this, resolveCanvasFilter(value));
		},
	});
	isInstalled = true;
}
