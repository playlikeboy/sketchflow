// Plain-data building blocks for the starter diagrams. No Excalidraw import, so the layouts
// can be checked in tests.
//
// The shapes below follow the "skeleton" format that Excalidraw's `convertToExcalidrawElements`
// accepts: boxes carry a `label`, and arrows name the boxes they join in `start` and `end`.
// Excalidraw does not route arrows itself, so every arrow is given real coordinates here.

import { centerOf, edgePoint, sidePoint, type Box, type ShapeKind, type Side, type XY } from "@/lib/diagram-templates/geometry";

export type DiagramTheme = "light" | "dark";
export type ArrowheadKind = "arrow" | "crowfoot_one" | "crowfoot_many" | null;

/** Text size used throughout the starters. Templates are drawn at about their inserted size. */
export const FONT_SIZE = 16;
/** Space left between an arrow tip and the box it is bound to. */
export const ARROW_GAP = 6;
// A rounded diamond's corners sit several pixels inside its bounding box, so an arrow aimed at
// one needs almost no extra gap to end up about as far away as it does from a rectangle.
const DIAMOND_ARROW_GAP = 1;

// Excalidraw's roundness types: 3 rounds a rectangle's corners, 2 rounds a diamond's.
const ROUND_RECTANGLE = { type: 3 } as const;
const ROUND_DIAMOND = { type: 2 } as const;

export type LabelSkeleton = {
	text: string;
	fontSize: number;
	textAlign?: "left" | "center";
	verticalAlign?: "top" | "middle";
	groupIds?: readonly string[];
};

type StrokeProps = {
	strokeColor: string;
	strokeWidth: number;
	strokeStyle: "solid" | "dashed";
	roughness: number;
	groupIds?: readonly string[];
};

export type ShapeSkeleton = Box &
	StrokeProps & {
		type: ShapeKind;
		id: string;
		backgroundColor: string;
		fillStyle: "solid";
		roundness: { type: 2 | 3 } | null;
		label?: LabelSkeleton;
		/** Our own marker for a backdrop that is meant to have other boxes inside it. */
		container?: true;
	};

export type ArrowSkeleton = StrokeProps & {
	type: "arrow";
	id: string;
	x: number;
	y: number;
	/** Relative to `x`/`y`; the first point is always [0, 0]. */
	points: readonly XY[];
	start?: { id: string };
	end?: { id: string };
	startArrowhead: ArrowheadKind;
	endArrowhead: ArrowheadKind;
	label?: LabelSkeleton;
};

export type LineSkeleton = StrokeProps & {
	type: "line";
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	points: readonly XY[];
};

export type DiagramSkeleton = ShapeSkeleton | ArrowSkeleton | LineSkeleton;

export type Palette = {
	/** Outline and text colour that reads on the current canvas. */
	stroke: string;
	/** Soft blue for the boxes a diagram is about. */
	accent: string;
	/** Soft grey for backdrops and secondary boxes. */
	neutral: string;
	none: "transparent";
};

export type Fill = "accent" | "neutral" | "none";

// The canvas is black with white strokes in the dark theme and white with near-black strokes
// in the light one. The fills are translucent tints, so they stay readable under either
// stroke colour when the theme is switched after a diagram has been inserted.
const PALETTES: Record<DiagramTheme, Palette> = {
	light: { stroke: "#1e1e1e", accent: "#2f7dd126", neutral: "#6b7a731f", none: "transparent" },
	dark: { stroke: "#ffffff", accent: "#5aa2f040", neutral: "#9fb0a824", none: "transparent" },
};

export function paletteFor(theme: DiagramTheme): Palette {
	return PALETTES[theme];
}

function strokeProps(palette: Palette, options: { dashed?: boolean; group?: string }): StrokeProps {
	return {
		strokeColor: palette.stroke,
		strokeWidth: 2,
		strokeStyle: options.dashed ? "dashed" : "solid",
		roughness: 1,
		...(options.group ? { groupIds: [options.group] } : {}),
	};
}

function roundnessFor(kind: ShapeKind) {
	if (kind === "rectangle") return ROUND_RECTANGLE;
	return kind === "diamond" ? ROUND_DIAMOND : null;
}

export type NodeOptions = {
	kind?: ShapeKind;
	fill?: Fill;
	dashed?: boolean;
	/** Boxes sharing a group move together on the canvas. */
	group?: string;
	textAlign?: "left" | "center";
};

/** A labelled box. The label is bound to the box, so it moves and wraps with it. */
export function node(palette: Palette, id: string, box: Box, text: string, options: NodeOptions = {}): ShapeSkeleton {
	const kind = options.kind ?? "rectangle";
	return {
		type: kind,
		id,
		...box,
		...strokeProps(palette, options),
		backgroundColor: palette[options.fill ?? "none"],
		fillStyle: "solid",
		roundness: roundnessFor(kind),
		label: {
			text,
			fontSize: FONT_SIZE,
			textAlign: options.textAlign ?? "center",
			verticalAlign: "middle",
			...(options.group ? { groupIds: [options.group] } : {}),
		},
	};
}

/** A titled backdrop that other boxes sit inside, such as a swimlane or a board column. */
export function container(palette: Palette, id: string, box: Box, title: string): ShapeSkeleton {
	return {
		type: "rectangle",
		id,
		...box,
		...strokeProps(palette, {}),
		strokeWidth: 1,
		backgroundColor: palette.neutral,
		fillStyle: "solid",
		roundness: ROUND_RECTANGLE,
		label: { text: title, fontSize: FONT_SIZE, textAlign: "left", verticalAlign: "top" },
		container: true,
	};
}

export type ArrowOptions = {
	label?: string;
	dashed?: boolean;
	startHead?: ArrowheadKind;
	/** Defaults to a plain arrowhead. Pass null for a connector with no head. */
	endHead?: ArrowheadKind;
};

function arrowThrough(palette: Palette, id: string, path: readonly XY[], options: ArrowOptions): ArrowSkeleton {
	const [originX, originY] = path[0];
	return {
		type: "arrow",
		id,
		x: originX,
		y: originY,
		points: path.map(([x, y]): XY => [x - originX, y - originY]),
		...strokeProps(palette, options),
		startArrowhead: options.startHead ?? null,
		endArrowhead: options.endHead === undefined ? "arrow" : options.endHead,
		...(options.label ? { label: { text: options.label, fontSize: FONT_SIZE } } : {}),
	};
}

function gapAround(shape: ShapeSkeleton) {
	return shape.type === "diamond" ? DIAMOND_ARROW_GAP : ARROW_GAP;
}

function bound(arrow: ArrowSkeleton, from: ShapeSkeleton, to: ShapeSkeleton): ArrowSkeleton {
	return { ...arrow, start: { id: from.id }, end: { id: to.id } };
}

/**
 * A straight arrow bound to both boxes. It runs along the line between their centres and stops
 * just short of each outline, which is where Excalidraw keeps it when either box is moved.
 */
export function connect(palette: Palette, id: string, from: ShapeSkeleton, to: ShapeSkeleton, options: ArrowOptions = {}): ArrowSkeleton {
	const path = [edgePoint(from, centerOf(to), gapAround(from)), edgePoint(to, centerOf(from), gapAround(to))];
	return bound(arrowThrough(palette, id, path, options), from, to);
}

function elbowCorners(start: XY, fromSide: Side, end: XY, toSide: Side): XY[] {
	const leavesVertically = fromSide === "top" || fromSide === "bottom";
	const arrivesVertically = toSide === "top" || toSide === "bottom";
	if (leavesVertically && !arrivesVertically) return [[start[0], end[1]]];
	if (!leavesVertically && arrivesVertically) return [[end[0], start[1]]];
	if (leavesVertically) {
		const middleY = (start[1] + end[1]) / 2;
		return [
			[start[0], middleY],
			[end[0], middleY],
		];
	}
	const middleX = (start[0] + end[0]) / 2;
	return [
		[middleX, start[1]],
		[middleX, end[1]],
	];
}

/**
 * A right-angled arrow bound to both boxes, leaving the middle of one side and arriving at the
 * middle of another. Use it where a straight arrow would cut across other boxes.
 */
export function elbow(
	palette: Palette,
	id: string,
	from: ShapeSkeleton,
	fromSide: Side,
	to: ShapeSkeleton,
	toSide: Side,
	options: ArrowOptions = {},
): ArrowSkeleton {
	const start = sidePoint(from, fromSide, gapAround(from));
	const end = sidePoint(to, toSide, gapAround(to));
	const path = [start, ...elbowCorners(start, fromSide, end, toSide), end];
	return bound(arrowThrough(palette, id, path, options), from, to);
}

/** An arrow between two points that is not bound to anything, such as a sequence message. */
export function freeArrow(palette: Palette, id: string, from: XY, to: XY, options: ArrowOptions = {}): ArrowSkeleton {
	return arrowThrough(palette, id, [from, to], options);
}

/** A plain line between two points, such as a sequence lifeline. */
export function line(palette: Palette, id: string, from: XY, to: XY, options: { dashed?: boolean; group?: string } = {}): LineSkeleton {
	const width = to[0] - from[0];
	const height = to[1] - from[1];
	return {
		type: "line",
		id,
		x: from[0],
		y: from[1],
		width,
		height,
		points: [
			[0, 0],
			[width, height],
		],
		...strokeProps(palette, options),
	};
}
