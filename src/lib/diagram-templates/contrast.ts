// Keeps converted Mermaid diagrams visible on the canvas.
//
// Mermaid's converter writes black text and outlines, which disappear on the dark theme's black
// canvas. Each stroke is compared with what is actually behind it (the canvas, or a filled box
// it sits in) and swapped for a readable ink only when the two are too close to tell apart.

import { elementsBounds, type Bounds, type SceneElement } from "@/lib/canvas-insert-geometry";

export type CanvasTheme = "light" | "dark";

type Rgba = { r: number; g: number; b: number; a: number };

const CANVAS_COLOR: Record<CanvasTheme, Rgba> = {
	light: { r: 255, g: 255, b: 255, a: 1 },
	dark: { r: 0, g: 0, b: 0, a: 1 },
};
const INK_ON_DARK = "#ffffff";
const INK_ON_LIGHT = "#1e1e1e";

// Difference in brightness (0 to 255) below which a stroke is lost against its backdrop.
const MIN_BRIGHTNESS_DIFFERENCE = 70;
const MID_BRIGHTNESS = 128;
// A fill fainter than this lets the canvas show through, so the canvas is the backdrop.
const MIN_BACKDROP_ALPHA = 0.5;

const NAMED_COLORS: Record<string, Rgba> = {
	black: { r: 0, g: 0, b: 0, a: 1 },
	white: { r: 255, g: 255, b: 255, a: 1 },
	transparent: { r: 0, g: 0, b: 0, a: 0 },
};

const HEX_COLOR = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/;
const RGB_COLOR = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/;

function parseHex(digits: string): Rgba {
	const full = digits.length <= 4 ? Array.from(digits, (digit) => digit + digit).join("") : digits;
	const channel = (start: number) => parseInt(full.slice(start, start + 2), 16);
	return { r: channel(0), g: channel(2), b: channel(4), a: full.length === 8 ? channel(6) / 255 : 1 };
}

function parseAlpha(value: string | undefined) {
	if (value === undefined) return 1;
	return value.endsWith("%") ? Number(value.slice(0, -1)) / 100 : Number(value);
}

/** Reads a hex, rgb()/rgba() or basic named colour. Null for anything else. */
export function parseColor(value: unknown): Rgba | null {
	if (typeof value !== "string") return null;
	const color = value.trim().toLowerCase();
	if (color in NAMED_COLORS) return NAMED_COLORS[color];

	const hex = color.match(HEX_COLOR);
	if (hex) return parseHex(hex[1]);

	const rgb = color.match(RGB_COLOR);
	if (!rgb) return null;
	return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: parseAlpha(rgb[4]) };
}

function brightness(color: Rgba) {
	return 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
}

type Backdrop = { bounds: Bounds; fill: Rgba; element: SceneElement };

const FILLABLE_TYPES = new Set(["rectangle", "ellipse", "diamond"]);

function backdropOf(element: SceneElement): Backdrop | null {
	if (!FILLABLE_TYPES.has(element.type)) return null;
	const fill = parseColor(element.backgroundColor);
	const bounds = elementsBounds([element]);
	if (!fill || !bounds || fill.a < MIN_BACKDROP_ALPHA) return null;
	return { bounds, fill, element };
}

function area(bounds: Bounds) {
	return bounds.width * bounds.height;
}

function contains(outer: Bounds, inner: Bounds) {
	return inner.minX >= outer.minX && inner.minY >= outer.minY && inner.maxX <= outer.maxX && inner.maxY <= outer.maxY;
}

// Text may spill a little past the box it labels, so only its middle has to be inside.
function probeOf(element: SceneElement, bounds: Bounds): Bounds {
	if (element.type !== "text") return bounds;
	const middleX = (bounds.minX + bounds.maxX) / 2;
	const middleY = (bounds.minY + bounds.maxY) / 2;
	return { minX: middleX, minY: middleY, maxX: middleX, maxY: middleY, width: 0, height: 0 };
}

function colorBehind(element: SceneElement, backdrops: readonly Backdrop[], theme: CanvasTheme): Rgba {
	const bounds = elementsBounds([element]);
	if (!bounds) return CANVAS_COLOR[theme];

	const probe = probeOf(element, bounds);
	// The smallest filled box around the element is the one directly behind it.
	const nearest = backdrops
		.filter((backdrop) => backdrop.element !== element && contains(backdrop.bounds, probe))
		.reduce<Backdrop | null>((smallest, backdrop) => (smallest && area(smallest.bounds) <= area(backdrop.bounds) ? smallest : backdrop), null);
	return nearest?.fill ?? CANVAS_COLOR[theme];
}

/**
 * Returns the elements with any stroke that cannot be seen against its backdrop replaced by
 * white (on dark) or near-black (on light). Fills and already-visible strokes are left alone.
 */
export function withReadableStrokes<T extends SceneElement>(elements: readonly T[], theme: CanvasTheme): T[] {
	const backdrops = elements.map(backdropOf).filter((backdrop): backdrop is Backdrop => backdrop !== null);

	return elements.map((element) => {
		const stroke = parseColor(element.strokeColor);
		if (!stroke || stroke.a === 0) return element;

		const behind = brightness(colorBehind(element, backdrops, theme));
		if (Math.abs(brightness(stroke) - behind) >= MIN_BRIGHTNESS_DIFFERENCE) return element;
		return { ...element, strokeColor: behind < MID_BRIGHTNESS ? INK_ON_DARK : INK_ON_LIGHT };
	});
}
