// Pure logic for "quick connect": the "+" handles around a selected shape that add a connected
// shape in that direction. No Excalidraw import, so it runs in tests.
//
// The arrow is written exactly the way Excalidraw 0.18.1's own flowchart shortcut
// (Ctrl/Cmd + Arrow, `createBindingArrow` in element/flowchart.ts) writes it: an elbow arrow that
// starts and ends a few units outside the two shapes and is bound to both with fixed points.

import type { Point, ViewportState } from "./canvas-insert-geometry";

export type Direction = "up" | "right" | "down" | "left";
export type Box = { x: number; y: number; width: number; height: number };

/** Clockwise from the top, which is also the order the handles are rendered and tabbed in. */
export const DIRECTIONS: readonly Direction[] = ["up", "right", "down", "left"];

/** Distance in screen pixels from a side of the shape to the centre of its handle. */
export const HANDLE_OFFSET_PX = 18;
/**
 * The top handle sits further out. Excalidraw draws its rotation handle centred 20px above the
 * top side (up to 28px across for touch), and a handle at 18px would cover it.
 */
export const TOP_HANDLE_OFFSET_PX = 40;
/** Space in scene units between the original shape and the new one. Excalidraw uses the same. */
export const CONNECT_GAP = 100;
/** How far outside each shape the arrow starts and ends, in scene units. Excalidraw uses the same. */
export const ARROW_PADDING = 6;
/** How many slots are tried on each side of the centred one before giving up. */
export const MAX_SLOT_STEPS = 12;
/** A slot is taken when another shape comes within this many scene units of it. */
export const SLOT_CLEARANCE = 20;

const FULL_TURN = Math.PI * 2;
const UPRIGHT_TOLERANCE = 0.01;
// Excalidraw never stores a fixed point of exactly 0.5 (see normalizeFixedPoint in binding.ts).
const FIXED_POINT_CENTRE = 0.5;
const FIXED_POINT_CENTRE_TOLERANCE = 0.0001;
const FIXED_POINT_OFF_CENTRE = 0.5001;

const UNIT: Record<Direction, Point> = {
	up: { x: 0, y: -1 },
	right: { x: 1, y: 0 },
	down: { x: 0, y: 1 },
	left: { x: -1, y: 0 },
};

const OPPOSITE: Record<Direction, Direction> = { up: "down", right: "left", down: "up", left: "right" };

const CONNECTABLE_TYPES: ReadonlySet<string> = new Set(["rectangle", "diamond", "ellipse"]);
// Arrows and lines span large, mostly empty boxes, and shapes live inside frames.
const NON_OBSTACLE_TYPES: ReadonlySet<string> = new Set(["arrow", "line", "frame", "magicframe", "selection"]);
const FRAME_TYPES: ReadonlySet<string> = new Set(["frame", "magicframe"]);

function isHorizontal(direction: Direction) {
	return direction === "left" || direction === "right";
}

// --- Geometry ----------------------------------------------------------------------------

/** The scene point in the middle of one side of a box. */
export function sideMidpoint(box: Box, direction: Direction): Point {
	const unit = UNIT[direction];
	return {
		x: box.x + box.width / 2 + (unit.x * box.width) / 2,
		y: box.y + box.height / 2 + (unit.y * box.height) / 2,
	};
}

/**
 * Where a scene point is drawn, in pixels from the top left of the canvas. This is Excalidraw's
 * `sceneCoordsToViewportCoords` without the container's page offset.
 */
export function sceneToScreen(point: Point, viewport: ViewportState): Point {
	const zoom = viewport.zoom.value || 1;
	return { x: (point.x + viewport.scrollX) * zoom, y: (point.y + viewport.scrollY) * zoom };
}

function screenBox(box: Box, viewport: ViewportState): Box {
	const zoom = viewport.zoom.value || 1;
	const origin = sceneToScreen(box, viewport);
	return { x: origin.x, y: origin.y, width: box.width * zoom, height: box.height * zoom };
}

/** True when at least part of the box is inside the visible canvas. */
export function isPartlyVisible(box: Box, viewport: ViewportState): boolean {
	const onScreen = screenBox(box, viewport);
	return onScreen.x <= viewport.width && onScreen.x + onScreen.width >= 0 && onScreen.y <= viewport.height && onScreen.y + onScreen.height >= 0;
}

/** True when the whole box is inside the visible canvas, at least `marginPx` from its edges. */
export function isFullyVisible(box: Box, viewport: ViewportState, marginPx = 0): boolean {
	const onScreen = screenBox(box, viewport);
	return (
		onScreen.x >= marginPx &&
		onScreen.y >= marginPx &&
		onScreen.x + onScreen.width <= viewport.width - marginPx &&
		onScreen.y + onScreen.height <= viewport.height - marginPx
	);
}

/** True when an element's `angle` (radians) is zero, or close enough that it looks unrotated. */
export function isUpright(angle: number | undefined): boolean {
	if (angle === undefined || !Number.isFinite(angle)) return true;
	const turned = ((angle % FULL_TURN) + FULL_TURN) % FULL_TURN;
	return turned < UPRIGHT_TOLERANCE || FULL_TURN - turned < UPRIGHT_TOLERANCE;
}

function boxesOverlap(a: Box, b: Box, clearance = 0) {
	return (
		a.x - clearance < b.x + b.width &&
		a.x + a.width + clearance > b.x &&
		a.y - clearance < b.y + b.height &&
		a.y + a.height + clearance > b.y
	);
}

/** The upright box around an element that may be rotated about its centre. */
function rotatedBounds(box: Box, angle = 0): Box {
	if (isUpright(angle)) return { x: box.x, y: box.y, width: box.width, height: box.height };
	const cos = Math.abs(Math.cos(angle));
	const sin = Math.abs(Math.sin(angle));
	const width = box.width * cos + box.height * sin;
	const height = box.width * sin + box.height * cos;
	return { x: box.x + box.width / 2 - width / 2, y: box.y + box.height / 2 - height / 2, width, height };
}

// --- Handles -----------------------------------------------------------------------------

export type HandlePosition = { direction: Direction; x: number; y: number };

/**
 * The centre of each handle in whole pixels from the top left of the canvas. The offset from
 * the shape is in screen pixels, so the handles stay the same distance away at any zoom.
 */
export function handlePositions(box: Box, viewport: ViewportState): HandlePosition[] {
	return DIRECTIONS.map((direction) => {
		const middle = sceneToScreen(sideMidpoint(box, direction), viewport);
		const offset = direction === "up" ? TOP_HANDLE_OFFSET_PX : HANDLE_OFFSET_PX;
		return {
			direction,
			x: Math.round(middle.x + UNIT[direction].x * offset),
			y: Math.round(middle.y + UNIT[direction].y * offset),
		};
	});
}

/** The parts of Excalidraw's app state that decide whether the handles are offered. */
export type QuickConnectState = ViewportState & {
	viewModeEnabled: boolean;
	activeTool: { type: string };
	selectedElementIds: Readonly<Record<string, boolean>>;
	editingTextElement: unknown;
	isResizing: boolean;
	isRotating: boolean;
	selectedElementsAreBeingDragged: boolean;
	resizingElement: unknown;
	newElement: unknown;
	multiElement: unknown;
	selectionElement: unknown;
};

/** The parts of an Excalidraw element this module reads. */
export type SceneShape = Box & {
	id: string;
	type: string;
	angle?: number;
	isDeleted?: boolean;
	locked?: boolean;
	frameId?: string | null;
	containerId?: string | null;
};

function isCanvasIdle(state: QuickConnectState) {
	return (
		!state.viewModeEnabled &&
		state.activeTool.type === "selection" &&
		!state.editingTextElement &&
		!state.isResizing &&
		!state.isRotating &&
		!state.selectedElementsAreBeingDragged &&
		!state.resizingElement &&
		!state.newElement &&
		!state.multiElement &&
		!state.selectionElement
	);
}

/** The id of the selected element when exactly one is selected. Stops counting at two. */
function soleSelectedId(selectedElementIds: Readonly<Record<string, boolean>>): string | null {
	let sole: string | null = null;
	for (const id in selectedElementIds) {
		if (!selectedElementIds[id]) continue;
		if (sole !== null) return null;
		sole = id;
	}
	return sole;
}

function isConnectable(element: SceneShape) {
	return (
		CONNECTABLE_TYPES.has(element.type) &&
		element.isDeleted !== true &&
		element.locked !== true &&
		element.width > 0 &&
		element.height > 0 &&
		// Rotated shapes get no handles: Excalidraw's own flowchart placement ignores rotation too,
		// and "to the right" of a tilted shape has no obviously correct meaning.
		isUpright(element.angle)
	);
}

/**
 * The shape the handles belong to, or null when none should be shown: the canvas must be idle
 * and editable, with the selection tool, and exactly one upright, unlocked rectangle, diamond or
 * ellipse selected that is at least partly on screen.
 */
export function quickConnectTarget<T extends SceneShape>(state: QuickConnectState, elements: readonly T[]): T | null {
	if (!isCanvasIdle(state)) return null;
	const id = soleSelectedId(state.selectedElementIds);
	if (id === null) return null;
	const element = elements.find((candidate) => candidate.id === id);
	if (!element || !isConnectable(element) || !isPartlyVisible(element, state)) return null;
	return element;
}

// --- Placement ---------------------------------------------------------------------------

/**
 * Where a new shape of the same size goes: one gap away in `direction`, centred on the same
 * axis. `step` moves it sideways (down for left/right, right for up/down) by whole
 * shape-plus-gap units, which is how siblings fan out in a tree.
 */
export function connectedSlot(box: Box, direction: Direction, step = 0): Box {
	const unit = UNIT[direction];
	const strideX = box.width + CONNECT_GAP;
	const strideY = box.height + CONNECT_GAP;
	const sideways = isHorizontal(direction) ? { x: 0, y: step * strideY } : { x: step * strideX, y: 0 };
	return {
		x: box.x + unit.x * strideX + sideways.x,
		y: box.y + unit.y * strideY + sideways.y,
		width: box.width,
		height: box.height,
	};
}

/** The order slots are tried in: 0, +1, -1, +2, -2, ... */
export function slotSteps(maxSteps = MAX_SLOT_STEPS): number[] {
	return [0, ...Array.from({ length: maxSteps }, (_, index) => [index + 1, -(index + 1)]).flat()];
}

/**
 * The first slot in `direction` that no obstacle overlaps or crowds. When every slot within
 * reach is taken, the centred slot is used so the new shape still appears where expected.
 */
export function findFreeSlot(box: Box, direction: Direction, obstacles: readonly Box[]): Box {
	for (const step of slotSteps()) {
		const slot = connectedSlot(box, direction, step);
		if (!obstacles.some((obstacle) => boxesOverlap(slot, obstacle, SLOT_CLEARANCE))) return slot;
	}
	return connectedSlot(box, direction, 0);
}

/** The boxes a new shape must avoid: every live element except connectors, frames and labels. */
export function obstacleBoxes(elements: readonly SceneShape[], excludeId: string): Box[] {
	return elements
		.filter((element) => element.id !== excludeId && element.isDeleted !== true && !NON_OBSTACLE_TYPES.has(element.type) && !element.containerId)
		.map((element) => rotatedBounds(element, element.angle));
}

/**
 * The frame the new shape joins: the original's frame, when the new shape lands on it. This is
 * the rule Excalidraw's flowchart shortcut applies.
 */
export function containingFrameId(original: SceneShape, slot: Box, elements: readonly SceneShape[]): string | null {
	if (!original.frameId) return null;
	const frame = elements.find((element) => element.id === original.frameId);
	if (!frame || frame.isDeleted === true || !FRAME_TYPES.has(frame.type)) return null;
	return boxesOverlap(slot, frame) ? frame.id : null;
}

// --- The arrow ---------------------------------------------------------------------------

export type FixedPoint = [number, number];
export type ArrowPoint = [number, number];

export type ArrowRoute = {
	/** Scene position of the first point. */
	x: number;
	y: number;
	width: number;
	height: number;
	/** Points relative to (x, y); the first is always [0, 0]. Segments are horizontal or vertical. */
	points: ArrowPoint[];
	/** Where the arrow is attached, as a fraction of each shape's width and height. */
	startFixedPoint: FixedPoint;
	endFixedPoint: FixedPoint;
};

function nudgeOffCentre(ratio: number) {
	return Math.abs(ratio - FIXED_POINT_CENTRE) < FIXED_POINT_CENTRE_TOLERANCE ? FIXED_POINT_OFF_CENTRE : ratio;
}

function fixedPoint(point: Point, box: Box): FixedPoint {
	return [nudgeOffCentre((point.x - box.x) / box.width), nudgeOffCentre((point.y - box.y) / box.height)];
}

function outside(box: Box, direction: Direction): Point {
	const middle = sideMidpoint(box, direction);
	return { x: middle.x + UNIT[direction].x * ARROW_PADDING, y: middle.y + UNIT[direction].y * ARROW_PADDING };
}

function elbowPoints(dx: number, dy: number, direction: Direction): ArrowPoint[] {
	if (isHorizontal(direction)) {
		return dy === 0 ? [[0, 0], [dx, 0]] : [[0, 0], [dx / 2, 0], [dx / 2, dy], [dx, dy]];
	}
	return dx === 0 ? [[0, 0], [0, dy]] : [[0, 0], [0, dy / 2], [dx, dy / 2], [dx, dy]];
}

/**
 * The arrow from the `direction` side of `from` to the facing side of `to`, where `to` is a slot
 * from `connectedSlot`. Straight when the two are in line, otherwise out, across and in, which is
 * the route Excalidraw's elbow router picks for the same two boxes.
 */
export function arrowRoute(from: Box, to: Box, direction: Direction): ArrowRoute {
	const start = outside(from, direction);
	const end = outside(to, OPPOSITE[direction]);
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	return {
		x: start.x,
		y: start.y,
		width: Math.abs(dx),
		height: Math.abs(dy),
		points: elbowPoints(dx, dy, direction),
		startFixedPoint: fixedPoint(start, from),
		endFixedPoint: fixedPoint(end, to),
	};
}

// --- Binding -----------------------------------------------------------------------------

type BoundRef = { id: string; type: string };
type Bindable = SceneShape & { boundElements?: readonly BoundRef[] | null };
type Versioned = { version?: number };

/** Values that make an edit to an existing element count as a change. Injected for tests. */
export type ChangeStamp = { now: number; nonce: number };

function arrowBinding(elementId: string, point: FixedPoint) {
	// The shape Excalidraw writes for an elbow arrow: see bindLinearElement in binding.ts.
	return { elementId, focus: 0, gap: 0, fixedPoint: point };
}

function withBoundArrow<T extends Bindable>(element: T, arrowId: string): T {
	return { ...element, boundElements: [...(element.boundElements ?? []), { id: arrowId, type: "arrow" }] };
}

function markChanged<T extends Versioned>(element: T, stamp: ChangeStamp): T {
	return { ...element, version: (element.version ?? 0) + 1, versionNonce: stamp.nonce, updated: stamp.now };
}

export type ConnectInput<TOriginal, TShape, TArrow> = {
	/** The selected shape, as it is in the scene. It is not modified. */
	original: TOriginal;
	/** The new shape, already placed in its slot. */
	shape: TShape;
	/** A new arrow element; its geometry and bindings are replaced. */
	arrow: TArrow;
	direction: Direction;
	/** Frame the new shape and arrow join, from `containingFrameId`. */
	frameId: string | null;
	stamp: ChangeStamp;
};

/**
 * Binds `arrow` between `original` and `shape`, on both sides: the arrow gets a start and end
 * binding, and each shape lists the arrow in `boundElements`. Without the second half Excalidraw
 * does not move the arrow when a shape moves. Returns new elements.
 */
export function connectElements<TOriginal extends Bindable & Versioned, TShape extends Bindable, TArrow extends { id: string }>(
	input: ConnectInput<TOriginal, TShape, TArrow>,
): { original: TOriginal; shape: TShape; arrow: TArrow } {
	const { original, shape, arrow, direction, frameId, stamp } = input;
	const route = arrowRoute(original, shape, direction);

	return {
		original: markChanged(withBoundArrow(original, arrow.id), stamp),
		// `index` is left empty so Excalidraw assigns the position in the stacking order.
		shape: { ...withBoundArrow(shape, arrow.id), frameId, index: null },
		arrow: {
			...arrow,
			x: route.x,
			y: route.y,
			width: route.width,
			height: route.height,
			angle: 0,
			points: route.points,
			startBinding: arrowBinding(original.id, route.startFixedPoint),
			endBinding: arrowBinding(shape.id, route.endFixedPoint),
			elbowed: true,
			fixedSegments: null,
			startIsSpecial: null,
			endIsSpecial: null,
			frameId,
			index: null,
		},
	};
}

// --- Writing the scene -------------------------------------------------------------------

export type SceneInsert<T> = {
	/** The updated copy of the selected shape; replaces the element with the same id. */
	original: T;
	/** The new shape and arrow, in stacking order. */
	added: readonly T[];
	/** Id of the frame the new elements belong to; they are placed just below it. */
	beforeId: string | null;
};

/**
 * The next scene: `original` swapped in, and the new elements added on top, or just below
 * their frame (Excalidraw keeps a frame's children below the frame itself).
 */
export function insertConnected<T extends { id: string }>(elements: readonly T[], insert: SceneInsert<T>): T[] {
	const swapped = elements.map((element) => (element.id === insert.original.id ? insert.original : element));
	const frameIndex = insert.beforeId === null ? -1 : swapped.findIndex((element) => element.id === insert.beforeId);
	if (frameIndex === -1) return [...swapped, ...insert.added];
	return [...swapped.slice(0, frameIndex), ...insert.added, ...swapped.slice(frameIndex)];
}
