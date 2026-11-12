import { expect, test } from "bun:test";

import {
	elementsBounds,
	fitSize,
	prepareElementsForInsert,
	svgDimensions,
	viewportCenter,
	type SceneElement,
} from "../src/lib/canvas-insert-geometry";

function sequentialIds() {
	let next = 0;
	return () => `new-${(next += 1)}`;
}

function rect(id: string, x: number, y: number, width: number, height: number, extra: Record<string, unknown> = {}): SceneElement {
	return { id, type: "rectangle", x, y, width, height, groupIds: [], ...extra };
}

test("finds the centre of the visible canvas, accounting for scroll and zoom", () => {
	expect(viewportCenter({ scrollX: 0, scrollY: 0, width: 800, height: 600, zoom: { value: 1 } })).toEqual({ x: 400, y: 300 });
	expect(viewportCenter({ scrollX: -100, scrollY: 50, width: 800, height: 600, zoom: { value: 2 } })).toEqual({ x: 300, y: 100 });
});

test("measures a set of shapes, including a line drawn towards the upper left", () => {
	const line: SceneElement = { id: "l", type: "line", x: 100, y: 100, width: 50, height: 40, points: [[0, 0], [-50, -40]] };

	expect(elementsBounds([rect("a", 0, 0, 20, 20), line])).toMatchObject({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
	expect(elementsBounds([])).toBeNull();
});

test("scales a size so its longest side matches the target", () => {
	expect(fitSize({ width: 1200, height: 600 }, 240)).toEqual({ width: 240, height: 120 });
	expect(fitSize({ width: 12, height: 24 }, 240)).toEqual({ width: 120, height: 240 });
});

test("inserts a huge library item and a tiny one at the same size, centred on the view", () => {
	const center = { x: 500, y: 400 };
	const huge = prepareElementsForInsert([rect("a", 9000, 9000, 4000, 2000)], { center, targetSize: 240, createId: sequentialIds() });
	const tiny = prepareElementsForInsert([rect("b", -3, -3, 4, 2)], { center, targetSize: 240, createId: sequentialIds() });

	for (const [element] of [huge, tiny]) {
		expect(element.width).toBeCloseTo(240);
		expect(element.height).toBeCloseTo(120);
		expect(element.x + element.width / 2).toBeCloseTo(center.x);
		expect(element.y + element.height / 2).toBeCloseTo(center.y);
	}
});

test("keeps the relative layout of a multi-shape item when scaling it", () => {
	const [left, right] = prepareElementsForInsert([rect("a", 0, 0, 100, 100), rect("b", 300, 0, 100, 100)], {
		center: { x: 0, y: 0 },
		targetSize: 200,
		createId: sequentialIds(),
	});

	expect(left.width).toBeCloseTo(50);
	expect(right.x - left.x).toBeCloseTo(150);
});

test("gives every element a new id and keeps groups, containers and arrow bindings connected", () => {
	const box = rect("box", 0, 0, 100, 50, { groupIds: ["g1"], boundElements: [{ id: "label", type: "text" }, { id: "arrow", type: "arrow" }] });
	const label: SceneElement = { id: "label", type: "text", x: 10, y: 10, width: 60, height: 20, groupIds: ["g1"], containerId: "box", fontSize: 20 };
	const arrow: SceneElement = {
		id: "arrow",
		type: "arrow",
		x: 100,
		y: 25,
		width: 100,
		height: 0,
		groupIds: [],
		points: [[0, 0], [100, 0]],
		startBinding: { elementId: "box", focus: 0, gap: 1 },
		endBinding: { elementId: "not-in-this-insert", focus: 0, gap: 1 },
	};

	const [newBox, newLabel, newArrow] = prepareElementsForInsert([box, label, arrow], {
		center: { x: 0, y: 0 },
		targetSize: 400,
		createId: sequentialIds(),
	});

	expect(new Set([newBox.id, newLabel.id, newArrow.id, "box", "label", "arrow"]).size).toBe(6);
	expect(newLabel.containerId).toBe(newBox.id);
	expect(newLabel.groupIds).toEqual(newBox.groupIds);
	expect((newBox.groupIds as string[])[0]).not.toBe("g1");
	expect(newBox.boundElements).toEqual([{ id: newLabel.id, type: "text" }, { id: newArrow.id, type: "arrow" }]);
	expect(newArrow.startBinding).toMatchObject({ elementId: newBox.id });
	expect(newArrow.endBinding).toBeNull();
	expect(newArrow.points).toEqual([[0, 0], [200, 0]]);
	expect(newLabel.fontSize).toBeCloseTo(40);
});

test("leaves the original elements untouched and skips deleted ones", () => {
	const original = rect("a", 10, 10, 100, 100);
	const deleted = rect("gone", 5000, 5000, 10, 10, { isDeleted: true });

	const prepared = prepareElementsForInsert([original, deleted], { center: { x: 0, y: 0 }, createId: sequentialIds() });

	expect(prepared).toHaveLength(1);
	expect(original).toMatchObject({ id: "a", x: 10, y: 10, width: 100, height: 100 });
});

test("reads an SVG's size from its attributes or its viewBox", () => {
	expect(svgDimensions('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="24"></svg>')).toEqual({ width: 48, height: 24 });
	expect(svgDimensions('<svg role="img" viewBox="0 0 24 24"><path d="M0 0"/></svg>')).toEqual({ width: 24, height: 24 });
	expect(svgDimensions('<svg width="100%" viewBox="0 0 300 150"></svg>')).toEqual({ width: 300, height: 150 });
	expect(svgDimensions("<div></div>")).toBeNull();
});
