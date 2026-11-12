// Measurements over a finished template: its extent, and whether its labels will fit.
//
// Excalidraw grows a box whose label does not fit, which would push a tidy layout out of line.
// Real text widths are only known in the browser, so these estimates err on the wide side.

import type { XY } from "@/lib/diagram-templates/geometry";
import type { ArrowSkeleton, DiagramSkeleton, LabelSkeleton, LineSkeleton, ShapeSkeleton } from "@/lib/diagram-templates/skeleton";

/** Line height of Excalidraw's default hand-drawn font, as a multiple of the font size. */
export const LINE_HEIGHT = 1.25;
// A generous average character width for that font, as a fraction of the font size.
const CHARACTER_WIDTH = 0.6;
// Space Excalidraw keeps between a box's outline and its label.
const LABEL_PADDING = 5;

export type Extent = { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };

export function isShape(skeleton: DiagramSkeleton): skeleton is ShapeSkeleton {
	return skeleton.type === "rectangle" || skeleton.type === "ellipse" || skeleton.type === "diamond";
}

export function isArrow(skeleton: DiagramSkeleton): skeleton is ArrowSkeleton {
	return skeleton.type === "arrow";
}

/** The points of an arrow or line in canvas coordinates. */
export function absolutePoints(linear: ArrowSkeleton | LineSkeleton): XY[] {
	return linear.points.map(([x, y]): XY => [linear.x + x, linear.y + y]);
}

function cornersOf(skeleton: DiagramSkeleton): XY[] {
	if (!isShape(skeleton)) return absolutePoints(skeleton);
	return [
		[skeleton.x, skeleton.y],
		[skeleton.x + skeleton.width, skeleton.y + skeleton.height],
	];
}

/** The box around everything in a template. */
export function skeletonExtent(skeletons: readonly DiagramSkeleton[]): Extent {
	const corners = skeletons.flatMap(cornersOf);
	if (corners.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };

	const xs = corners.map((corner) => corner[0]);
	const ys = corners.map((corner) => corner[1]);
	const minX = Math.min(...xs);
	const minY = Math.min(...ys);
	const maxX = Math.max(...xs);
	const maxY = Math.max(...ys);
	return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function estimateTextWidth(text: string, fontSize: number) {
	return text.length * fontSize * CHARACTER_WIDTH;
}

// The room Excalidraw gives a label inside each kind of box.
function labelRoom(shape: ShapeSkeleton) {
	if (shape.type === "ellipse") {
		return { width: (shape.width / 2) * Math.SQRT2 - LABEL_PADDING * 2, height: (shape.height / 2) * Math.SQRT2 - LABEL_PADDING * 2 };
	}
	if (shape.type === "diamond") {
		return { width: shape.width / 2 - LABEL_PADDING * 2, height: shape.height / 2 - LABEL_PADDING * 2 };
	}
	return { width: shape.width - LABEL_PADDING * 2, height: shape.height - LABEL_PADDING * 2 };
}

// Greedy word wrap of one paragraph. A word wider than the line is left on a line of its own.
function wrapParagraph(paragraph: string, maxCharacters: number): string[] {
	return paragraph.split(" ").reduce<string[]>((lines, word) => {
		const current = lines[lines.length - 1];
		if (current !== undefined && `${current} ${word}`.length <= maxCharacters) {
			return [...lines.slice(0, -1), `${current} ${word}`];
		}
		return [...lines, word];
	}, []);
}

/** The lines a label is expected to wrap to inside a space `maxWidth` wide. */
export function wrapLabel(label: LabelSkeleton, maxWidth: number): string[] {
	const maxCharacters = Math.floor(maxWidth / (label.fontSize * CHARACTER_WIDTH));
	return label.text.split("\n").flatMap((paragraph) => wrapParagraph(paragraph, maxCharacters));
}

/** Whether a box's label is expected to fit without Excalidraw having to grow the box. */
export function labelFits(shape: ShapeSkeleton): boolean {
	const label = shape.label;
	if (!label) return true;
	const room = labelRoom(shape);
	const lines = wrapLabel(label, room.width);
	const widest = Math.max(...lines.map((text) => estimateTextWidth(text, label.fontSize)));
	const height = lines.length * label.fontSize * LINE_HEIGHT;
	return widest <= room.width && height <= room.height;
}
