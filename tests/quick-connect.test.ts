import { expect, test } from "bun:test";

import {
	ARROW_PADDING,
	CONNECT_GAP,
	DIRECTIONS,
	HANDLE_OFFSET_PX,
	MAX_SLOT_STEPS,
	TOP_HANDLE_OFFSET_PX,
	arrowRoute,
	connectElements,
	connectedSlot,
	containingFrameId,
	findFreeSlot,
	handlePositions,
	insertConnected,
	isFullyVisible,
	isPartlyVisible,
	isUpright,
	obstacleBoxes,
	quickConnectTarget,
	sceneToScreen,
	sideMidpoint,
	slotSteps,
	type Box,
	type Direction,
	type QuickConnectState,
	type SceneShape,
} from "../src/lib/quick-connect";

/** A scene element as loosely typed as the ones Excalidraw hands over. */
type TestElement = SceneShape & { boundElements: { id: string; type: string }[] | null; version: number; [key: string]: unknown };
type TestArrow = { id: string; type: string; [key: string]: unknown };

const SHAPE: Box = { x: 100, y: 100, width: 200, height: 80 };

function viewport(overrides: Partial<QuickConnectState> = {}) {
	return { scrollX: 0, scrollY: 0, width: 1000, height: 800, zoom: { value: 1 }, ...overrides };
}

function idleState(overrides: Partial<QuickConnectState> = {}): QuickConnectState {
	return {
		...viewport(),
		viewModeEnabled: false,
		activeTool: { type: "selection" },
		selectedElementIds: { a: true },
		editingTextElement: null,
		isResizing: false,
		isRotating: false,
		selectedElementsAreBeingDragged: false,
		resizingElement: null,
		newElement: null,
		multiElement: null,
		selectionElement: null,
		...overrides,
	};
}

function shape(id: string, box: Box = SHAPE, extra: Record<string, unknown> = {}): TestElement {
	return { id, type: "rectangle", ...box, angle: 0, isDeleted: false, locked: false, frameId: null, boundElements: null, version: 3, versionNonce: 11, updated: 5, ...extra };
}

// --- Side midpoints and handle positions -------------------------------------------------

test("finds the middle of each side of a shape", () => {
	expect(sideMidpoint(SHAPE, "up")).toEqual({ x: 200, y: 100 });
	expect(sideMidpoint(SHAPE, "right")).toEqual({ x: 300, y: 140 });
	expect(sideMidpoint(SHAPE, "down")).toEqual({ x: 200, y: 180 });
	expect(sideMidpoint(SHAPE, "left")).toEqual({ x: 100, y: 140 });
});

test("maps a scene point to the canvas through scroll and zoom, as Excalidraw does", () => {
	// Excalidraw: (scene + scroll) * zoom, before its container offset is added.
	expect(sceneToScreen({ x: 300, y: 140 }, viewport())).toEqual({ x: 300, y: 140 });
	expect(sceneToScreen({ x: 300, y: 140 }, viewport({ scrollX: -50, scrollY: 20, zoom: { value: 2 } }))).toEqual({ x: 500, y: 320 });
	expect(sceneToScreen({ x: 300, y: 140 }, viewport({ scrollX: 100, scrollY: 60, zoom: { value: 0.5 } }))).toEqual({ x: 200, y: 100 });
});

test("puts a handle a fixed number of screen pixels outside each side", () => {
	const handles = handlePositions(SHAPE, viewport());

	expect(handles).toEqual([
		{ direction: "up", x: 200, y: 100 - TOP_HANDLE_OFFSET_PX },
		{ direction: "right", x: 300 + HANDLE_OFFSET_PX, y: 140 },
		{ direction: "down", x: 200, y: 180 + HANDLE_OFFSET_PX },
		{ direction: "left", x: 100 - HANDLE_OFFSET_PX, y: 140 },
	]);
});

test("keeps the handle offset in screen pixels whatever the zoom and scroll", () => {
	const zoomedIn = handlePositions(SHAPE, viewport({ scrollX: -50, scrollY: 20, zoom: { value: 2 } }));
	const zoomedOut = handlePositions(SHAPE, viewport({ scrollX: 100, scrollY: 60, zoom: { value: 0.5 } }));

	// Right side midpoint (300, 140) is at (500, 320) when zoomed in and (200, 100) when zoomed out.
	expect(zoomedIn.find((handle) => handle.direction === "right")).toEqual({ direction: "right", x: 500 + HANDLE_OFFSET_PX, y: 320 });
	expect(zoomedOut.find((handle) => handle.direction === "right")).toEqual({ direction: "right", x: 200 + HANDLE_OFFSET_PX, y: 100 });
	// Top side midpoint (200, 100) is at (300, 240) when zoomed in.
	expect(zoomedIn.find((handle) => handle.direction === "up")).toEqual({ direction: "up", x: 300, y: 240 - TOP_HANDLE_OFFSET_PX });
});

test("rounds handle positions to whole pixels so tiny scroll changes do not re-render", () => {
	const handles = handlePositions(SHAPE, viewport({ scrollX: 0.2, scrollY: 0.3, zoom: { value: 1.1 } }));

	for (const handle of handles) {
		expect(Number.isInteger(handle.x)).toBe(true);
		expect(Number.isInteger(handle.y)).toBe(true);
	}
});

test("moves the top handle clear of Excalidraw's rotation handle", () => {
	// The rotation handle is centred 20px above the top side and is at most 28px across.
	expect(TOP_HANDLE_OFFSET_PX).toBeGreaterThan(HANDLE_OFFSET_PX);
	expect(TOP_HANDLE_OFFSET_PX - 10).toBeGreaterThanOrEqual(24);
});

// --- Visibility --------------------------------------------------------------------------

test("knows whether a shape is on screen", () => {
	const view = viewport({ width: 400, height: 300 });

	expect(isPartlyVisible(SHAPE, view)).toBe(true);
	expect(isPartlyVisible({ x: 390, y: 290, width: 50, height: 50 }, view)).toBe(true);
	expect(isPartlyVisible({ x: 401, y: 0, width: 50, height: 50 }, view)).toBe(false);
	expect(isPartlyVisible({ x: -60, y: 0, width: 50, height: 50 }, view)).toBe(false);
	// Scrolled into view.
	expect(isPartlyVisible({ x: -60, y: 0, width: 50, height: 50 }, { ...view, scrollX: 100 })).toBe(true);
});

test("knows whether a shape is completely on screen, with a margin", () => {
	const view = viewport({ width: 400, height: 300 });

	expect(isFullyVisible(SHAPE, view)).toBe(true);
	expect(isFullyVisible(SHAPE, view, 50)).toBe(true);
	expect(isFullyVisible({ x: 300, y: 100, width: 200, height: 80 }, view)).toBe(false);
	expect(isFullyVisible({ x: 190, y: 100, width: 200, height: 80 }, view, 20)).toBe(false);
	expect(isFullyVisible(SHAPE, { ...view, zoom: { value: 2 } })).toBe(false);
});

test("treats only unrotated shapes as upright", () => {
	expect(isUpright(0)).toBe(true);
	expect(isUpright(undefined)).toBe(true);
	expect(isUpright(Math.PI * 2)).toBe(true);
	expect(isUpright(0.001)).toBe(true);
	expect(isUpright(Math.PI * 2 - 0.001)).toBe(true);
	expect(isUpright(0.3)).toBe(false);
	expect(isUpright(Math.PI)).toBe(false);
});

// --- When the handles are offered --------------------------------------------------------

test("offers handles for exactly one selected rectangle, diamond or ellipse", () => {
	for (const type of ["rectangle", "diamond", "ellipse"]) {
		expect(quickConnectTarget(idleState(), [shape("a", SHAPE, { type })])?.id).toBe("a");
	}
	for (const type of ["text", "image", "arrow", "line", "freedraw", "frame"]) {
		expect(quickConnectTarget(idleState(), [shape("a", SHAPE, { type })])).toBeNull();
	}
});

test("offers no handles for an empty or multiple selection", () => {
	const elements = [shape("a"), shape("b", { ...SHAPE, y: 400 })];

	expect(quickConnectTarget(idleState({ selectedElementIds: {} }), elements)).toBeNull();
	expect(quickConnectTarget(idleState({ selectedElementIds: { a: true, b: true } }), elements)).toBeNull();
	expect(quickConnectTarget(idleState({ selectedElementIds: { missing: true } }), elements)).toBeNull();
	// An id left in the map with a false value is not selected.
	expect(quickConnectTarget(idleState({ selectedElementIds: { a: false, b: true } }), elements)?.id).toBe("b");
});

test("treats a missing zoom as 100%", () => {
	expect(sceneToScreen({ x: 300, y: 140 }, viewport({ scrollX: 10, zoom: { value: 0 } }))).toEqual({ x: 310, y: 140 });
	expect(isPartlyVisible(SHAPE, viewport({ zoom: { value: 0 } }))).toBe(true);
});

test("offers no handles while the canvas is busy or read-only", () => {
	const elements = [shape("a")];
	const busy: Partial<QuickConnectState>[] = [
		{ viewModeEnabled: true },
		{ activeTool: { type: "rectangle" } },
		{ activeTool: { type: "hand" } },
		{ editingTextElement: { id: "t" } },
		{ isResizing: true },
		{ isRotating: true },
		{ selectedElementsAreBeingDragged: true },
		{ resizingElement: { id: "a" } },
		{ newElement: { id: "n" } },
		{ multiElement: { id: "m" } },
		{ selectionElement: { id: "s" } },
	];

	for (const overrides of busy) {
		expect(quickConnectTarget(idleState(overrides), elements)).toBeNull();
	}
	expect(quickConnectTarget(idleState(), elements)?.id).toBe("a");
});

test("offers no handles for a rotated, locked, deleted, empty or off-screen shape", () => {
	const hidden = [{ angle: 0.5 }, { locked: true }, { isDeleted: true }, { width: 0 }, { x: 5000 }];

	for (const extra of hidden) {
		expect(quickConnectTarget(idleState(), [shape("a", SHAPE, extra)])).toBeNull();
	}
});

// --- Where the new shape goes ------------------------------------------------------------

test("places the new shape one gap away in each direction, centred on the same axis", () => {
	expect(connectedSlot(SHAPE, "right")).toEqual({ x: 300 + CONNECT_GAP, y: 100, width: 200, height: 80 });
	expect(connectedSlot(SHAPE, "left")).toEqual({ x: 100 - CONNECT_GAP - 200, y: 100, width: 200, height: 80 });
	expect(connectedSlot(SHAPE, "down")).toEqual({ x: 100, y: 180 + CONNECT_GAP, width: 200, height: 80 });
	expect(connectedSlot(SHAPE, "up")).toEqual({ x: 100, y: 100 - CONNECT_GAP - 80, width: 200, height: 80 });
});

test("steps a slot sideways by whole shape-plus-gap units", () => {
	expect(connectedSlot(SHAPE, "right", 1)).toEqual({ x: 400, y: 100 + 80 + CONNECT_GAP, width: 200, height: 80 });
	expect(connectedSlot(SHAPE, "right", -2)).toEqual({ x: 400, y: 100 - 2 * (80 + CONNECT_GAP), width: 200, height: 80 });
	expect(connectedSlot(SHAPE, "down", 1)).toEqual({ x: 100 + 200 + CONNECT_GAP, y: 280, width: 200, height: 80 });
	expect(connectedSlot(SHAPE, "up", -1)).toEqual({ x: 100 - 200 - CONNECT_GAP, y: -80, width: 200, height: 80 });
});

test("tries slots outwards from the centre, alternating sides", () => {
	expect(slotSteps(3)).toEqual([0, 1, -1, 2, -2, 3, -3]);
	expect(slotSteps()).toHaveLength(MAX_SLOT_STEPS * 2 + 1);
});

test("uses the centred slot when nothing is in the way", () => {
	expect(findFreeSlot(SHAPE, "right", [])).toEqual(connectedSlot(SHAPE, "right"));
	// Something far away does not count.
	expect(findFreeSlot(SHAPE, "right", [{ x: 2000, y: 2000, width: 50, height: 50 }])).toEqual(connectedSlot(SHAPE, "right"));
});

test("steps past occupied slots like a tree layout", () => {
	const first = connectedSlot(SHAPE, "right");
	const second = connectedSlot(SHAPE, "right", 1);
	const third = connectedSlot(SHAPE, "right", -1);

	expect(findFreeSlot(SHAPE, "right", [first])).toEqual(second);
	expect(findFreeSlot(SHAPE, "right", [first, second])).toEqual(third);
	expect(findFreeSlot(SHAPE, "right", [first, second, third])).toEqual(connectedSlot(SHAPE, "right", 2));
	expect(findFreeSlot(SHAPE, "down", [connectedSlot(SHAPE, "down")])).toEqual(connectedSlot(SHAPE, "down", 1));
});

test("treats a shape that only clips the slot, or sits right against it, as in the way", () => {
	const clipping = { x: 590, y: 170, width: 100, height: 100 };
	const touching = { x: 610, y: 100, width: 100, height: 80 };

	expect(findFreeSlot(SHAPE, "right", [clipping])).toEqual(connectedSlot(SHAPE, "right", -1));
	expect(findFreeSlot(SHAPE, "right", [touching])).toEqual(connectedSlot(SHAPE, "right", 1));
});

test("steps past occupied slots above and to the left too", () => {
	expect(findFreeSlot(SHAPE, "up", [connectedSlot(SHAPE, "up")])).toEqual(connectedSlot(SHAPE, "up", 1));
	expect(findFreeSlot(SHAPE, "left", [connectedSlot(SHAPE, "left"), connectedSlot(SHAPE, "left", 1)])).toEqual(connectedSlot(SHAPE, "left", -1));
});

test("falls back to the centred slot when the search is exhausted", () => {
	const wall = { x: 350, y: -100000, width: 300, height: 200000 };

	expect(findFreeSlot(SHAPE, "right", [wall])).toEqual(connectedSlot(SHAPE, "right"));
});

test("collects the boxes that can be in the way", () => {
	const elements = [
		shape("a"),
		shape("b", { x: 500, y: 0, width: 40, height: 40 }),
		shape("gone", { x: 0, y: 0, width: 10, height: 10 }, { isDeleted: true }),
		shape("arrow", { x: 0, y: 0, width: 900, height: 900 }, { type: "arrow" }),
		shape("line", { x: 0, y: 0, width: 900, height: 900 }, { type: "line" }),
		shape("frame", { x: -50, y: -50, width: 2000, height: 2000 }, { type: "frame" }),
		shape("label", { x: 510, y: 10, width: 20, height: 20 }, { type: "text", containerId: "b" }),
		shape("note", { x: 700, y: 0, width: 60, height: 20 }, { type: "text", containerId: null }),
	];

	expect(obstacleBoxes(elements, "a")).toEqual([
		{ x: 500, y: 0, width: 40, height: 40 },
		{ x: 700, y: 0, width: 60, height: 20 },
	]);
});

test("measures a rotated obstacle by the box around it", () => {
	const [box] = obstacleBoxes([shape("b", { x: 0, y: 0, width: 100, height: 20 }, { angle: Math.PI / 2 })], "a");

	expect(box.x).toBeCloseTo(40);
	expect(box.y).toBeCloseTo(-40);
	expect(box.width).toBeCloseTo(20);
	expect(box.height).toBeCloseTo(100);
});

// --- The arrow ---------------------------------------------------------------------------

test("draws a straight arrow between facing sides, the way Excalidraw's own flowchart shortcut does", () => {
	// Reference values produced by Excalidraw 0.18.1's createBindingArrow for these two boxes.
	expect(arrowRoute(SHAPE, connectedSlot(SHAPE, "right"), "right")).toEqual({
		x: 306,
		y: 140,
		width: 88,
		height: 0,
		points: [[0, 0], [88, 0]],
		startFixedPoint: [1.03, 0.5001],
		endFixedPoint: [-0.03, 0.5001],
	});
	expect(arrowRoute(SHAPE, connectedSlot(SHAPE, "left"), "left")).toMatchObject({
		x: 94,
		y: 140,
		points: [[0, 0], [-88, 0]],
		startFixedPoint: [-0.03, 0.5001],
		endFixedPoint: [1.03, 0.5001],
	});
	expect(arrowRoute(SHAPE, connectedSlot(SHAPE, "down"), "down")).toMatchObject({
		x: 200,
		y: 186,
		width: 0,
		height: 88,
		points: [[0, 0], [0, 88]],
		startFixedPoint: [0.5001, 1.075],
		endFixedPoint: [0.5001, -0.075],
	});
	expect(arrowRoute(SHAPE, connectedSlot(SHAPE, "up"), "up")).toMatchObject({
		x: 200,
		y: 94,
		points: [[0, 0], [0, -88]],
		startFixedPoint: [0.5001, -0.075],
		endFixedPoint: [0.5001, 1.075],
	});
});

test("starts and ends the arrow just outside the two shapes", () => {
	for (const direction of DIRECTIONS) {
		const slot = connectedSlot(SHAPE, direction);
		const route = arrowRoute(SHAPE, slot, direction);
		const last = route.points[route.points.length - 1];

		expect(Math.hypot(last[0], last[1])).toBe(CONNECT_GAP - 2 * ARROW_PADDING);
	}
});

test("routes a right-angled arrow to a shape that was stepped aside", () => {
	// Reference values produced by Excalidraw 0.18.1's elbow router for the same boxes.
	expect(arrowRoute(SHAPE, connectedSlot(SHAPE, "right", 1), "right")).toMatchObject({
		x: 306,
		y: 140,
		width: 88,
		height: 180,
		points: [[0, 0], [44, 0], [44, 180], [88, 180]],
		startFixedPoint: [1.03, 0.5001],
		endFixedPoint: [-0.03, 0.5001],
	});
	expect(arrowRoute(SHAPE, connectedSlot(SHAPE, "right", -1), "right")).toMatchObject({
		width: 88,
		height: 180,
		points: [[0, 0], [44, 0], [44, -180], [88, -180]],
	});
	expect(arrowRoute(SHAPE, connectedSlot(SHAPE, "down", 1), "down")).toMatchObject({
		x: 200,
		y: 186,
		width: 300,
		height: 88,
		points: [[0, 0], [0, 44], [300, 44], [300, 88]],
	});
	expect(arrowRoute(SHAPE, connectedSlot(SHAPE, "up", -1), "up")).toMatchObject({
		points: [[0, 0], [0, -44], [-300, -44], [-300, -88]],
	});
});

test("only ever draws horizontal and vertical arrow segments", () => {
	for (const direction of DIRECTIONS) {
		for (const step of slotSteps(3)) {
			const { points } = arrowRoute(SHAPE, connectedSlot(SHAPE, direction, step), direction);

			expect(points[0]).toEqual([0, 0]);
			points.slice(1).forEach((point, index) => {
				expect(point[0] === points[index][0] || point[1] === points[index][1]).toBe(true);
			});
		}
	}
});

// --- Binding -----------------------------------------------------------------------------

function connect(direction: Direction = "right", extra: Record<string, unknown> = {}) {
	const original = shape("a", SHAPE, extra);
	const slot = connectedSlot(SHAPE, direction);
	const newShape = shape("b", slot, { version: 1, versionNonce: 0, index: "a0" });
	const arrow: TestArrow = { id: "arrow", type: "arrow", x: 0, y: 0, width: 100, height: 0, points: [[0, 0], [100, 0]], startBinding: null, endBinding: null, elbowed: false, index: "a1", frameId: null };

	return { original, slot, result: connectElements({ original, shape: newShape, arrow, direction, frameId: null, stamp: { now: 99, nonce: 777 } }) };
}

test("binds the arrow to both shapes, and both shapes to the arrow", () => {
	const { result } = connect("right");

	expect(result.arrow.startBinding).toEqual({ elementId: "a", focus: 0, gap: 0, fixedPoint: [1.03, 0.5001] });
	expect(result.arrow.endBinding).toEqual({ elementId: "b", focus: 0, gap: 0, fixedPoint: [-0.03, 0.5001] });
	expect(result.original.boundElements).toEqual([{ id: "arrow", type: "arrow" }]);
	expect(result.shape.boundElements).toEqual([{ id: "arrow", type: "arrow" }]);
});

test("binds the facing sides in every direction", () => {
	const expected: Record<Direction, [number[], number[]]> = {
		up: [[0.5001, -0.075], [0.5001, 1.075]],
		right: [[1.03, 0.5001], [-0.03, 0.5001]],
		down: [[0.5001, 1.075], [0.5001, -0.075]],
		left: [[-0.03, 0.5001], [1.03, 0.5001]],
	};

	for (const direction of DIRECTIONS) {
		const { result } = connect(direction);

		expect(result.arrow.startBinding).toEqual({ elementId: "a", focus: 0, gap: 0, fixedPoint: expected[direction][0] });
		expect(result.arrow.endBinding).toEqual({ elementId: "b", focus: 0, gap: 0, fixedPoint: expected[direction][1] });
	}
});

test("does not modify the new shape or arrow it was given", () => {
	const original = shape("a");
	const newShape = shape("b", connectedSlot(SHAPE, "right"));
	const arrow: TestArrow = { id: "arrow", type: "arrow", x: 0, y: 0, points: [[0, 0], [100, 0]], startBinding: null, endBinding: null };

	const result = connectElements({ original, shape: newShape, arrow, direction: "right", frameId: null, stamp: { now: 1, nonce: 2 } });

	expect(result.shape).not.toBe(newShape);
	expect(result.arrow).not.toBe(arrow);
	expect(newShape.boundElements).toBeNull();
	expect(arrow).toEqual({ id: "arrow", type: "arrow", x: 0, y: 0, points: [[0, 0], [100, 0]], startBinding: null, endBinding: null });
});

test("writes the arrow as an Excalidraw elbow arrow along the planned route", () => {
	const { result } = connect("down");

	expect(result.arrow).toMatchObject({
		id: "arrow",
		type: "arrow",
		x: 200,
		y: 186,
		width: 0,
		height: 88,
		points: [[0, 0], [0, 88]],
		elbowed: true,
		fixedSegments: null,
		startIsSpecial: null,
		endIsSpecial: null,
		angle: 0,
		index: null,
	});
});

test("keeps the original's existing bindings and marks it as changed", () => {
	const label = { id: "label", type: "text" };
	const { original, result } = connect("right", { boundElements: [label] });

	expect(result.original.boundElements).toEqual([label, { id: "arrow", type: "arrow" }]);
	expect(result.original.id).toBe("a");
	expect(result.original.version).toBe(4);
	expect(result.original.versionNonce).toBe(777);
	expect(result.original.updated).toBe(99);
	// The element that is already in the scene is not modified.
	expect(result.original).not.toBe(original);
	expect(original.boundElements).toEqual([label]);
	expect(original.version).toBe(3);
});

test("leaves the stacking order of the new elements for Excalidraw to assign", () => {
	const { result } = connect("right");

	expect(result.shape.index).toBeNull();
	expect(result.arrow.index).toBeNull();
});

test("puts the new shape and arrow in a frame when asked", () => {
	const original = shape("a", SHAPE, { frameId: "f" });
	const newShape = shape("b", connectedSlot(SHAPE, "right"));
	const arrow: TestArrow = { id: "arrow", type: "arrow", x: 0, y: 0, width: 0, height: 0, frameId: null };

	const result = connectElements({ original, shape: newShape, arrow, direction: "right", frameId: "f", stamp: { now: 1, nonce: 2 } });

	expect(result.shape.frameId).toBe("f");
	expect(result.arrow.frameId).toBe("f");
});

test("joins the original's frame only when the new shape lands on it", () => {
	const frame = shape("f", { x: 0, y: 0, width: 800, height: 400 }, { type: "frame" });
	const framed = shape("a", SHAPE, { frameId: "f" });
	const loose = shape("a", SHAPE);

	expect(containingFrameId(framed, connectedSlot(SHAPE, "right"), [frame, framed])).toBe("f");
	expect(containingFrameId(framed, { x: 900, y: 100, width: 200, height: 80 }, [frame, framed])).toBeNull();
	expect(containingFrameId(loose, connectedSlot(SHAPE, "right"), [frame, loose])).toBeNull();
	expect(containingFrameId(framed, connectedSlot(SHAPE, "right"), [framed])).toBeNull();
	expect(containingFrameId(framed, connectedSlot(SHAPE, "right"), [{ ...frame, isDeleted: true }, framed])).toBeNull();
});

// --- Writing the scene -------------------------------------------------------------------

test("adds the new elements on top and swaps in the updated original", () => {
	const scene = [{ id: "x" }, { id: "a", old: true }, { id: "y" }];
	const original = { id: "a", old: false };

	const next = insertConnected(scene, { original, added: [{ id: "b" }, { id: "arrow" }], beforeId: null });

	expect(next.map((element) => element.id)).toEqual(["x", "a", "y", "b", "arrow"]);
	expect(next[1]).toBe(original);
	expect(scene).toHaveLength(3);
});

test("adds framed elements just below their frame", () => {
	const scene = [{ id: "a" }, { id: "f" }, { id: "y" }];

	const next = insertConnected(scene, { original: { id: "a" }, added: [{ id: "b" }, { id: "arrow" }], beforeId: "f" });

	expect(next.map((element) => element.id)).toEqual(["a", "b", "arrow", "f", "y"]);
});

test("still adds the new elements when the original is no longer in the scene", () => {
	const next = insertConnected([{ id: "x" }], { original: { id: "a" }, added: [{ id: "b" }], beforeId: null });

	expect(next.map((element) => element.id)).toEqual(["x", "b"]);
});

test("adds on top when the frame cannot be found", () => {
	const next = insertConnected([{ id: "a" }], { original: { id: "a" }, added: [{ id: "b" }], beforeId: "missing" });

	expect(next.map((element) => element.id)).toEqual(["a", "b"]);
});
