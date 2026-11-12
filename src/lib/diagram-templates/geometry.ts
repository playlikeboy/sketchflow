// Coordinate helpers for laying out diagram templates. Pure numbers, no Excalidraw.

export type XY = readonly [number, number];
export type Box = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };
export type Side = "top" | "right" | "bottom" | "left";
export type ShapeKind = "rectangle" | "ellipse" | "diamond";
export type Outline = Box & { type: ShapeKind };

// Keeps generated coordinates tidy without moving anything by a visible amount.
function tidy(value: number) {
	return Math.round(value * 100) / 100;
}

/** A box of `size` whose middle is at the given point. */
export function centered(centerX: number, centerY: number, size: Size): Box {
	return { x: centerX - size.width / 2, y: centerY - size.height / 2, width: size.width, height: size.height };
}

export function centerOf(box: Box): XY {
	return [box.x + box.width / 2, box.y + box.height / 2];
}

// How far along the ray from the centre the outline is, as a fraction of (dx, dy).
function outlineFraction(shape: Outline, dx: number, dy: number) {
	const horizontal = Math.abs(dx) / (shape.width / 2);
	const vertical = Math.abs(dy) / (shape.height / 2);
	if (shape.type === "ellipse") return 1 / Math.hypot(horizontal, vertical);
	if (shape.type === "diamond") return 1 / (horizontal + vertical);
	return 1 / Math.max(horizontal, vertical);
}

/**
 * The point `gap` outside the shape's outline, on the line from its centre towards `toward`.
 * An arrow that ends here points straight at the centre, which is how Excalidraw draws it.
 */
export function edgePoint(shape: Outline, toward: XY, gap: number): XY {
	const [centerX, centerY] = centerOf(shape);
	const dx = toward[0] - centerX;
	const dy = toward[1] - centerY;
	const distance = Math.hypot(dx, dy);
	if (distance === 0) return [centerX, centerY];

	const reach = outlineFraction(shape, dx, dy) + gap / distance;
	return [tidy(centerX + dx * reach), tidy(centerY + dy * reach)];
}

/** The point `gap` outside the middle of one side of a box. */
export function sidePoint(box: Box, side: Side, gap: number): XY {
	const [centerX, centerY] = centerOf(box);
	if (side === "top") return [centerX, box.y - gap];
	if (side === "bottom") return [centerX, box.y + box.height + gap];
	if (side === "left") return [box.x - gap, centerY];
	return [box.x + box.width + gap, centerY];
}

/** Whether a point is strictly inside the shape's outline. */
export function isInside(shape: Outline, point: XY): boolean {
	const [centerX, centerY] = centerOf(shape);
	const dx = point[0] - centerX;
	const dy = point[1] - centerY;
	if (dx === 0 && dy === 0) return true;
	return outlineFraction(shape, dx, dy) > 1;
}

/** Whether two boxes share any area. Boxes that only touch along an edge do not overlap. */
export function boxesOverlap(a: Box, b: Box): boolean {
	return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Whether `inner` lies completely within `outer`. */
export function boxContains(outer: Box, inner: Box): boolean {
	return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
}

/** The tops of items stacked downwards from zero with `gap` between them. */
export function stackTops(heights: readonly number[], gap: number): number[] {
	return heights.map((_, index) => heights.slice(0, index).reduce((total, height) => total + height + gap, 0));
}
