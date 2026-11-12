// Pure geometry for putting things on the canvas. No Excalidraw import, so it runs in tests.
//
// Everything inserted from the Insert panel lands in the middle of what the person is looking
// at and at one predictable size, whatever size its author happened to draw it at.

/** The longest side, in scene units, that an inserted item is scaled to. */
export const DEFAULT_INSERT_SIZE = 240;

// Only guards against degenerate input; real items are scaled to the target whatever their size.
const MIN_SCALE = 0.001;
const MAX_SCALE = 1000;

export type Point = { x: number; y: number };

/** The parts of an Excalidraw element this module reads. Everything else is carried through. */
export type SceneElement = {
	id: string;
	type: string;
	x: number;
	y: number;
	width: number;
	height: number;
	[key: string]: unknown;
};

export type ViewportState = {
	scrollX: number;
	scrollY: number;
	width: number;
	height: number;
	zoom: { value: number };
};

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };

type ElementBinding = { elementId: string; [key: string]: unknown };
type BoundElementRef = { id: string; type: string };

/** How far each further insert is shifted when the spot is already taken. */
export const CASCADE_STEP = 32;
const CASCADE_LIMIT = 12;
const SAME_SPOT_TOLERANCE = 8;

/**
 * Where to centre a new insert so it does not land exactly on top of something already
 * centred there. Each occupied spot shifts the insert down and to the right by one step, the
 * way pasted items cascade. `step` is in scene units; pass a zoom-adjusted value so the shift
 * looks the same at any zoom.
 */
export function freeInsertCenter(center: Point, elements: readonly SceneElement[], step = CASCADE_STEP): Point {
	const occupied = elements
		.filter((element) => element.isDeleted !== true)
		.map((element) => {
			const extent = elementsBounds([element]) as Bounds;
			return { x: extent.minX + extent.width / 2, y: extent.minY + extent.height / 2 };
		});
	const isTaken = (point: Point) =>
		occupied.some((spot) => Math.abs(spot.x - point.x) <= SAME_SPOT_TOLERANCE && Math.abs(spot.y - point.y) <= SAME_SPOT_TOLERANCE);

	let candidate = center;
	for (let attempt = 0; attempt < CASCADE_LIMIT && isTaken(candidate); attempt += 1) {
		candidate = { x: candidate.x + step, y: candidate.y + step };
	}
	return candidate;
}

/** The scene point at the centre of the visible canvas. */
export function viewportCenter(state: ViewportState): Point {
	const zoom = state.zoom.value || 1;
	return { x: state.width / 2 / zoom - state.scrollX, y: state.height / 2 / zoom - state.scrollY };
}

function isPointList(value: unknown): value is [number, number][] {
	return Array.isArray(value) && value.every((point) => Array.isArray(point) && typeof point[0] === "number" && typeof point[1] === "number");
}

function elementExtent(element: SceneElement): Bounds {
	// Lines, arrows and freehand strokes are positioned by their first point; their other
	// points are relative to it and may be negative.
	if (isPointList(element.points) && element.points.length > 0) {
		const xs = element.points.map((point) => element.x + point[0]);
		const ys = element.points.map((point) => element.y + point[1]);
		const minX = Math.min(...xs);
		const minY = Math.min(...ys);
		const maxX = Math.max(...xs);
		const maxY = Math.max(...ys);
		return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
	}

	const maxX = element.x + element.width;
	const maxY = element.y + element.height;
	return { minX: element.x, minY: element.y, maxX, maxY, width: element.width, height: element.height };
}

/** The box around a set of elements (rotation is ignored). Null for an empty set. */
export function elementsBounds(elements: readonly SceneElement[]): Bounds | null {
	if (elements.length === 0) return null;
	const extents = elements.map(elementExtent);
	const minX = Math.min(...extents.map((extent) => extent.minX));
	const minY = Math.min(...extents.map((extent) => extent.minY));
	const maxX = Math.max(...extents.map((extent) => extent.maxX));
	const maxY = Math.max(...extents.map((extent) => extent.maxY));
	return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/** The factor that makes the longest side of `size` equal to `targetSize`. */
export function fitScale(size: { width: number; height: number }, targetSize = DEFAULT_INSERT_SIZE) {
	const longest = Math.max(size.width, size.height);
	if (!Number.isFinite(longest) || longest <= 0) return 1;
	return Math.min(MAX_SCALE, Math.max(MIN_SCALE, targetSize / longest));
}

/** Width and height scaled so the longest side equals `targetSize`, keeping the aspect ratio. */
export function fitSize(size: { width: number; height: number }, targetSize = DEFAULT_INSERT_SIZE) {
	const scale = fitScale(size, targetSize);
	return { width: size.width * scale, height: size.height * scale };
}

function remapId(ids: ReadonlyMap<string, string>, value: unknown) {
	return typeof value === "string" ? (ids.get(value) ?? null) : null;
}

function remapBinding(ids: ReadonlyMap<string, string>, binding: unknown): ElementBinding | null {
	if (!binding || typeof binding !== "object" || !("elementId" in binding)) return null;
	const elementId = remapId(ids, (binding as ElementBinding).elementId);
	// A binding to something that is not part of this insert would dangle, so it is dropped.
	return elementId ? { ...(binding as ElementBinding), elementId } : null;
}

function remapBoundElements(ids: ReadonlyMap<string, string>, bound: unknown): BoundElementRef[] | null {
	if (!Array.isArray(bound)) return null;
	const kept = (bound as BoundElementRef[])
		.map((reference) => ({ reference, id: remapId(ids, reference?.id) }))
		.filter((entry): entry is { reference: BoundElementRef; id: string } => entry.id !== null)
		.map((entry) => ({ ...entry.reference, id: entry.id }));
	return kept.length > 0 ? kept : null;
}

function remapGroups(groups: Map<string, string>, value: unknown, createId: () => string) {
	if (!Array.isArray(value)) return [];
	return (value as string[]).map((groupId) => {
		const existing = groups.get(groupId);
		if (existing) return existing;
		const created = createId();
		groups.set(groupId, created);
		return created;
	});
}

export type PrepareOptions = {
	/** Scene point the inserted set is centred on. */
	center: Point;
	/** Longest side of the inserted set, in scene units. */
	targetSize?: number;
	/** Makes a new unique id. Injected so tests are deterministic. */
	createId: () => string;
	/** Timestamp written to each element's `updated` field. */
	now?: number;
};

/**
 * Copies `elements` so they can be added to a scene: fresh ids (with groups, containers and
 * arrow bindings inside the set kept intact), scaled so the whole set's longest side is
 * `targetSize`, and centred on `center`. The input is not modified.
 */
export function prepareElementsForInsert(elements: readonly SceneElement[], options: PrepareOptions): SceneElement[] {
	const live = elements.filter((element) => element.isDeleted !== true);
	const bounds = elementsBounds(live);
	if (!bounds) return [];

	const scale = fitScale(bounds, options.targetSize);
	const originX = options.center.x - (bounds.width * scale) / 2;
	const originY = options.center.y - (bounds.height * scale) / 2;
	const ids = new Map(live.map((element) => [element.id, options.createId()]));
	const groups = new Map<string, string>();
	const updated = options.now ?? Date.now();

	return live.map((element) => {
		const scaled: SceneElement = {
			...element,
			id: ids.get(element.id) as string,
			x: originX + (element.x - bounds.minX) * scale,
			y: originY + (element.y - bounds.minY) * scale,
			width: element.width * scale,
			height: element.height * scale,
			groupIds: remapGroups(groups, element.groupIds, options.createId),
			containerId: remapId(ids, element.containerId),
			frameId: remapId(ids, element.frameId),
			boundElements: remapBoundElements(ids, element.boundElements),
			// Left empty so Excalidraw assigns a fresh position in the stacking order.
			index: null,
			version: 1,
			updated,
			isDeleted: false,
		};

		if (isPointList(element.points)) {
			scaled.points = element.points.map((point) => [point[0] * scale, point[1] * scale]);
			scaled.startBinding = remapBinding(ids, element.startBinding);
			scaled.endBinding = remapBinding(ids, element.endBinding);
		}
		if (typeof element.fontSize === "number") {
			scaled.fontSize = element.fontSize * scale;
		}

		return scaled;
	});
}

const SVG_ROOT_TAG = /<svg\b[^>]*>/i;
const SVG_SIZE_ATTRIBUTE = (name: string) => new RegExp(`\\s${name}\\s*=\\s*["'][^"']*["']`, "i");

/**
 * Returns the SVG with a pixel `width` and `height` on its root element. An SVG that only has a
 * viewBox (or a percentage size) has no intrinsic size, and some browsers refuse to draw it.
 */
export function withExplicitSvgSize(svg: string, size: { width: number; height: number }) {
	const tag = svg.match(SVG_ROOT_TAG)?.[0];
	if (!tag) return svg;

	const hasPixelSize = (name: string) => {
		const value = tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];
		return value !== undefined && SVG_LENGTH.test(value);
	};
	if (hasPixelSize("width") && hasPixelSize("height")) return svg;

	const stripped = tag.replace(SVG_SIZE_ATTRIBUTE("width"), "").replace(SVG_SIZE_ATTRIBUTE("height"), "");
	const sized = stripped.replace(/^<svg\b/i, `<svg width="${size.width}" height="${size.height}"`);
	return svg.replace(tag, sized);
}

const SVG_LENGTH = /^\s*([0-9]*\.?[0-9]+)\s*(px)?\s*$/i;

/** The intrinsic size of an SVG document from its width/height or viewBox. Null if it has neither. */
export function svgDimensions(svg: string): { width: number; height: number } | null {
	const tag = svg.match(/<svg\b[^>]*>/i)?.[0];
	if (!tag) return null;

	const attribute = (name: string) => tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];
	const width = attribute("width")?.match(SVG_LENGTH)?.[1];
	const height = attribute("height")?.match(SVG_LENGTH)?.[1];
	if (width && height) {
		return { width: Number(width), height: Number(height) };
	}

	const viewBox = attribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
	if (viewBox && viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
		return { width: viewBox[2], height: viewBox[3] };
	}

	return null;
}
