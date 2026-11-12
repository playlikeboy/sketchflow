// Turns a template into a few rectangles and lines for a thumbnail, so the picker can show
// what a diagram looks like without rendering Excalidraw.

import type { ShapeKind, XY } from "@/lib/diagram-templates/geometry";
import { absolutePoints, isShape, skeletonExtent } from "@/lib/diagram-templates/measure";
import type { ArrowSkeleton, DiagramSkeleton, LineSkeleton, ShapeSkeleton } from "@/lib/diagram-templates/skeleton";

/** The longest side of every preview. Coordinates run from 0 to this value. */
export const PREVIEW_SIZE = 100;

export type PreviewShape = {
	id: string;
	kind: ShapeKind;
	x: number;
	y: number;
	width: number;
	height: number;
	/** A backdrop is drawn faintly, a filled box is tinted, and a plain box is an outline. */
	tone: "backdrop" | "filled" | "plain";
};

export type PreviewLine = { id: string; points: XY[]; isDashed: boolean };

export type TemplatePreview = { width: number; height: number; shapes: PreviewShape[]; lines: PreviewLine[] };

function toneOf(shape: ShapeSkeleton): PreviewShape["tone"] {
	if (shape.container) return "backdrop";
	return shape.backgroundColor === "transparent" ? "plain" : "filled";
}

/**
 * The template's boxes and connectors scaled into a box whose longest side is PREVIEW_SIZE,
 * with its top-left corner at the origin.
 */
export function templatePreview(skeletons: readonly DiagramSkeleton[]): TemplatePreview {
	const extent = skeletonExtent(skeletons);
	const longestSide = Math.max(extent.width, extent.height);
	if (longestSide <= 0) return { width: 0, height: 0, shapes: [], lines: [] };

	const scale = PREVIEW_SIZE / longestSide;
	const place = ([x, y]: XY): XY => [(x - extent.minX) * scale, (y - extent.minY) * scale];

	const shapes = skeletons.filter(isShape).map((shape): PreviewShape => {
		const [x, y] = place([shape.x, shape.y]);
		return { id: shape.id, kind: shape.type, x, y, width: shape.width * scale, height: shape.height * scale, tone: toneOf(shape) };
	});
	const lines = skeletons
		.filter((skeleton): skeleton is ArrowSkeleton | LineSkeleton => !isShape(skeleton))
		.map((linear): PreviewLine => ({ id: linear.id, points: absolutePoints(linear).map(place), isDashed: linear.strokeStyle === "dashed" }));

	return { width: extent.width * scale, height: extent.height * scale, shapes, lines };
}
