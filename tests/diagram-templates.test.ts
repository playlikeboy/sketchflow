import { describe, expect, test } from "bun:test";

import type { SceneElement } from "../src/lib/canvas-insert-geometry";
import {
	absolutePoints,
	ARROW_GAP,
	boxContains,
	boxesOverlap,
	DIAGRAM_TEMPLATES,
	estimateTextWidth,
	isArrow,
	isInside,
	isShape,
	labelFits,
	LINE_HEIGHT,
	MAX_TARGET_SIZE,
	MIN_TARGET_SIZE,
	PREVIEW_SIZE,
	skeletonExtent,
	templatePreview,
	toConvertibleSkeletons,
	type ArrowSkeleton,
	type DiagramSkeleton,
	type DiagramTheme,
	type LineSkeleton,
	type ShapeSkeleton,
} from "../src/lib/diagram-templates";
import { parseColor, withReadableStrokes } from "../src/lib/diagram-templates/contrast";
import {
	describeMermaidError,
	EmptyDiagramError,
	MERMAID_EXAMPLES,
	MERMAID_MAX_LENGTH,
	mermaidInputProblem,
	MermaidUnavailableError,
} from "../src/lib/diagram-templates/mermaid";

const THEMES: readonly DiagramTheme[] = ["light", "dark"];
const STROKE_FOR_THEME: Record<DiagramTheme, string> = { light: "#1e1e1e", dark: "#ffffff" };
const REQUIRED_TEMPLATE_IDS = ["flowchart", "sequence", "entity-relationship", "architecture", "mind-map", "swimlanes", "org-chart", "kanban", "user-journey"];

// Excalidraw stops treating an arrow as attached once its tip is further than this from a box.
const MAX_BINDING_DISTANCE = 16;
// Clear space wanted on each side of a label that sits on an arrow.
const ARROW_LABEL_MARGIN = 12;
const SAMPLE_STEP = 2;

type XY = readonly [number, number];

const shapesOf = (skeletons: readonly DiagramSkeleton[]) => skeletons.filter(isShape);
const arrowsOf = (skeletons: readonly DiagramSkeleton[]) => skeletons.filter(isArrow);
const pathsOf = (skeletons: readonly DiagramSkeleton[]) => skeletons.filter((skeleton): skeleton is ArrowSkeleton | LineSkeleton => !isShape(skeleton));
const boxesOf = (skeletons: readonly DiagramSkeleton[]) => shapesOf(skeletons).filter((shape) => !shape.container);
const containersOf = (skeletons: readonly DiagramSkeleton[]) => shapesOf(skeletons).filter((shape) => shape.container);

function shapeById(skeletons: readonly DiagramSkeleton[], id: string | undefined) {
	return shapesOf(skeletons).find((shape) => shape.id === id);
}

function pairsOf<T>(items: readonly T[]): [T, T][] {
	return items.flatMap((first, index) => items.slice(index + 1).map((second): [T, T] => [first, second]));
}

function distanceToBox(point: XY, box: ShapeSkeleton) {
	const dx = Math.max(box.x - point[0], 0, point[0] - (box.x + box.width));
	const dy = Math.max(box.y - point[1], 0, point[1] - (box.y + box.height));
	return Math.hypot(dx, dy);
}

// Points every couple of pixels along a path, for checking what it passes over.
function samplesAlong(path: readonly XY[]): XY[] {
	return path.slice(1).flatMap((end, index) => {
		const start = path[index];
		const steps = Math.max(1, Math.ceil(Math.hypot(end[0] - start[0], end[1] - start[1]) / SAMPLE_STEP));
		return Array.from({ length: steps + 1 }, (_, step): XY => [start[0] + ((end[0] - start[0]) * step) / steps, start[1] + ((end[1] - start[1]) * step) / steps]);
	});
}

// The segment a label sits on: Excalidraw centres it on the middle of the arrow's path.
function middleSegmentLength(arrow: ArrowSkeleton) {
	const points = absolutePoints(arrow);
	const end = points[points.length / 2];
	const start = points[points.length / 2 - 1];
	return { length: Math.hypot(end[0] - start[0], end[1] - start[1]), isHorizontal: Math.abs(end[0] - start[0]) >= Math.abs(end[1] - start[1]) };
}

test("offers every starter diagram, each with a name and a one-line description", () => {
	const ids = DIAGRAM_TEMPLATES.map((template) => template.id);

	expect(ids).toEqual(expect.arrayContaining(REQUIRED_TEMPLATE_IDS));
	expect(new Set(ids).size).toBe(ids.length);
	for (const template of DIAGRAM_TEMPLATES) {
		expect(template.name.trim().length).toBeGreaterThan(0);
		expect(template.description.trim().length).toBeGreaterThan(0);
		expect(template.description).not.toContain("\n");
	}
});

for (const template of DIAGRAM_TEMPLATES) {
	describe(`${template.name} template`, () => {
		for (const theme of THEMES) {
			test(`builds for the ${theme} theme with strokes that show on that canvas`, () => {
				const skeletons = template.build(theme);

				expect(skeletons.length).toBeGreaterThan(0);
				expect(shapesOf(skeletons).length).toBeGreaterThan(0);
				for (const skeleton of skeletons) {
					expect(skeleton.strokeColor).toBe(STROKE_FOR_THEME[theme]);
				}
			});

			test(`has the same layout in the ${theme} theme as in the light one`, () => {
				const withoutColors = (skeletons: DiagramSkeleton[]) => skeletons.map((skeleton) => ({ ...skeleton, strokeColor: "", backgroundColor: "" }));

				expect(withoutColors(template.build(theme))).toEqual(withoutColors(template.build("light")));
			});
		}

		const skeletons = template.build("light");

		test("gives every shape, arrow and line its own id", () => {
			const ids = skeletons.map((skeleton) => skeleton.id);

			expect(ids.every((id) => id.length > 0)).toBe(true);
			expect(new Set(ids).size).toBe(ids.length);
		});

		test("binds every arrow end to a shape that exists in the template", () => {
			const shapeIds = new Set(shapesOf(skeletons).map((shape) => shape.id));

			for (const arrow of arrowsOf(skeletons)) {
				if (arrow.start) expect(shapeIds.has(arrow.start.id)).toBe(true);
				if (arrow.end) expect(shapeIds.has(arrow.end.id)).toBe(true);
				// An arrow joins two boxes or none; one loose end would be a mistake.
				expect(Boolean(arrow.start)).toBe(Boolean(arrow.end));
				expect(arrow.start?.id === undefined || arrow.start.id !== arrow.end?.id).toBe(true);
			}
		});

		test("ends each bound arrow just outside the shape it is bound to", () => {
			for (const arrow of arrowsOf(skeletons).filter((candidate) => candidate.start && candidate.end)) {
				const points = absolutePoints(arrow);
				const ends: [XY, ShapeSkeleton | undefined][] = [
					[points[0], shapeById(skeletons, arrow.start?.id)],
					[points[points.length - 1], shapeById(skeletons, arrow.end?.id)],
				];

				for (const [point, shape] of ends) {
					expect(shape).toBeDefined();
					if (!shape) continue;
					expect(isInside(shape, point)).toBe(false);
					expect(distanceToBox(point, shape)).toBeLessThanOrEqual(ARROW_GAP + 0.01);
					expect(ARROW_GAP).toBeLessThan(MAX_BINDING_DISTANCE);
				}
			}
		});

		test("draws arrows and lines as real paths that start at their own origin", () => {
			for (const linear of pathsOf(skeletons)) {
				expect(linear.points.length).toBeGreaterThanOrEqual(2);
				expect(linear.points[0]).toEqual([0, 0]);
				for (const [index, point] of linear.points.entries()) {
					expect(Number.isFinite(point[0]) && Number.isFinite(point[1])).toBe(true);
					if (index > 0) expect(point).not.toEqual(linear.points[index - 1]);
				}
			}
		});

		test("routes no arrow or line across a box it is not attached to", () => {
			const boxes = boxesOf(skeletons);

			for (const linear of pathsOf(skeletons)) {
				const attached = isArrow(linear) ? [linear.start?.id, linear.end?.id] : [];
				const others = boxes.filter((box) => !attached.includes(box.id));
				const crossed = others.filter((box) => samplesAlong(absolutePoints(linear)).some((point) => isInside(box, point)));

				expect(crossed.map((box) => `${linear.id} crosses ${box.id}`)).toEqual([]);
			}
		});

		test("keeps boxes from overlapping one another", () => {
			const overlapping = pairsOf(boxesOf(skeletons)).filter(([first, second]) => boxesOverlap(first, second));

			expect(overlapping.map(([first, second]) => `${first.id} overlaps ${second.id}`)).toEqual([]);
		});

		test("keeps backdrops apart, with every box fully inside or fully outside each one", () => {
			const containers = containersOf(skeletons);
			const overlapping = pairsOf(containers).filter(([first, second]) => boxesOverlap(first, second));
			const straddling = containers.flatMap((backdrop) =>
				boxesOf(skeletons)
					.filter((box) => boxesOverlap(backdrop, box) && !boxContains(backdrop, box))
					.map((box) => `${box.id} straddles ${backdrop.id}`),
			);

			expect(overlapping.map(([first, second]) => `${first.id} overlaps ${second.id}`)).toEqual([]);
			expect(straddling).toEqual([]);
		});

		test("labels every shape with short text that fits inside it", () => {
			for (const shape of shapesOf(skeletons)) {
				expect(shape.label?.text.trim().length ?? 0).toBeGreaterThan(0);
				expect(`${shape.id}: ${labelFits(shape)}`).toBe(`${shape.id}: true`);
			}
		});

		test("puts arrow labels on a straight stretch with room to spare", () => {
			for (const arrow of arrowsOf(skeletons)) {
				if (!arrow.label) continue;
				const segment = middleSegmentLength(arrow);
				const needed = segment.isHorizontal ? estimateTextWidth(arrow.label.text, arrow.label.fontSize) : arrow.label.fontSize * LINE_HEIGHT;

				expect(arrow.label.text.trim().length).toBeGreaterThan(0);
				// With an odd number of points the label would sit on a corner.
				expect(arrow.points.length % 2).toBe(0);
				expect(segment.length).toBeGreaterThanOrEqual(needed + ARROW_LABEL_MARGIN * 2);
			}
		});

		test("is drawn at close to the size it is inserted at", () => {
			const extent = skeletonExtent(skeletons);
			const scale = template.targetSize / Math.max(extent.width, extent.height);

			expect(template.targetSize).toBeGreaterThanOrEqual(MIN_TARGET_SIZE);
			expect(template.targetSize).toBeLessThanOrEqual(MAX_TARGET_SIZE);
			expect(scale).toBeGreaterThan(0.9);
			expect(scale).toBeLessThan(1.1);
		});

		test("previews as shapes and lines inside a normalised box", () => {
			const preview = templatePreview(skeletons);
			const tolerance = 1e-6;

			expect(Math.max(preview.width, preview.height)).toBeCloseTo(PREVIEW_SIZE, 6);
			expect(preview.shapes.length).toBe(shapesOf(skeletons).length);
			expect(preview.lines.length).toBe(skeletons.length - shapesOf(skeletons).length);
			for (const shape of preview.shapes) {
				expect(shape.x).toBeGreaterThanOrEqual(-tolerance);
				expect(shape.y).toBeGreaterThanOrEqual(-tolerance);
				expect(shape.x + shape.width).toBeLessThanOrEqual(preview.width + tolerance);
				expect(shape.y + shape.height).toBeLessThanOrEqual(preview.height + tolerance);
				expect(shape.width).toBeGreaterThan(0);
				expect(shape.height).toBeGreaterThan(0);
			}
			for (const point of preview.lines.flatMap((line) => line.points)) {
				expect(point[0]).toBeGreaterThanOrEqual(-tolerance);
				expect(point[0]).toBeLessThanOrEqual(preview.width + tolerance);
				expect(point[1]).toBeGreaterThanOrEqual(-tolerance);
				expect(point[1]).toBeLessThanOrEqual(preview.height + tolerance);
			}
		});

		test("hands Excalidraw plain data without our own markers", () => {
			const convertible = toConvertibleSkeletons(skeletons);

			expect(convertible.length).toBe(skeletons.length);
			expect(convertible.some((skeleton) => "container" in skeleton)).toBe(false);
			expect(JSON.parse(JSON.stringify(convertible))).toEqual(convertible);
			// Building again gives fresh objects, so a template can be inserted any number of times.
			expect(template.build("light")).not.toBe(skeletons);
		});
	});
}

test("previews an empty template as an empty box", () => {
	expect(templatePreview([])).toEqual({ width: 0, height: 0, shapes: [], lines: [] });
});

describe("Mermaid text", () => {
	test("offers a flowchart, a sequence and a class diagram example", () => {
		const firstWords = MERMAID_EXAMPLES.map((example) => example.text.split(/\s/)[0]);

		expect(firstWords).toEqual(["flowchart", "sequenceDiagram", "classDiagram"]);
		for (const example of MERMAID_EXAMPLES) {
			expect(example.label.length).toBeGreaterThan(0);
			expect(mermaidInputProblem(example.text)).toBeNull();
		}
	});

	test("asks for text when there is none, and refuses text that is too long", () => {
		expect(mermaidInputProblem("  \n ")).toBe("Paste or type some Mermaid text first.");
		expect(mermaidInputProblem("a".repeat(MERMAID_MAX_LENGTH + 1))).toContain("too long");
		expect(mermaidInputProblem("flowchart TD\n  A --> B")).toBeNull();
	});

	// The error messages below were captured from Mermaid 11's own parsers.
	test("quotes the person's own line near a grammar error, even when the parser counts one line too far", () => {
		const source = "flowchart TD\n  A --> B\n  B -- Yes -> C";
		const error = new Error("Parse error on line 4:\n...> B  B -- Yes -> C\n---------------------^\nExpecting 'LINK', 'UNICODE_TEXT', 'EDGE_TEXT', got '1'");

		expect(describeMermaidError(error, source)).toBe("That Mermaid text has a syntax error near line 3: B -- Yes -> C");
	});

	test("reads the line number from the newer parsers' errors too", () => {
		const source = 'pie title Pets\n  "Dogs" : x';
		const error = new Error(
			"Parsing failed: Lexer error on line 2, column 12: unexpected character: ->x<- at offset: 26, skipped 1 characters. Parse error on line 2, column 13: Expecting token of type 'NUMBER_PIE'",
		);

		expect(describeMermaidError(error, source)).toBe('That Mermaid text has a syntax error near line 2: "Dogs" : x');
	});

	test("falls back to the parser's excerpt, then to the line number alone, when that line is blank", () => {
		const source = "flowchart TD\n\n  A --> B";
		const withExcerpt = new Error("Parse error on line 2:\n...flowchart TD  A --\n--------------------^\nExpecting 'LINK', got 'EOF'");

		expect(describeMermaidError(withExcerpt, source)).toBe("That Mermaid text has a syntax error near line 2: flowchart TD A --");
		expect(describeMermaidError(new Error("Lexical error on line 2. Unrecognized text."), source)).toBe("That Mermaid text has a syntax error near line 2.");
	});

	test("explains text that is not Mermaid at all", () => {
		const error = new Error("No diagram type detected matching given configuration for text: hello there");

		expect(describeMermaidError(error, "hello there")).toContain("does not look like Mermaid text");
	});

	test("passes on a short parser message, and hides a long or empty one", () => {
		const long = new Error(`Something went wrong ${"x".repeat(400)}`);

		expect(describeMermaidError(new Error("Maximum text size in diagram exceeded"), "x")).toBe("That Mermaid text could not be converted: Maximum text size in diagram exceeded");
		expect(describeMermaidError(long, "x")).toBe("That Mermaid text has a syntax error. Compare it with one of the examples and try again.");
		expect(describeMermaidError(undefined, "x")).toBe("That Mermaid text has a syntax error. Compare it with one of the examples and try again.");
		expect(describeMermaidError("bad\u0007 thing\nhappened", "x")).toBe("That Mermaid text could not be converted: bad thing happened");
	});

	test("says so when the converter cannot be loaded or the diagram is empty", () => {
		const offline = new MermaidUnavailableError("The Mermaid converter could not be loaded.", { cause: new Error("Failed to fetch") });

		expect(describeMermaidError(offline, "flowchart TD")).toBe("The Mermaid converter could not be loaded. Check your connection and try again.");
		expect(describeMermaidError(new EmptyDiagramError("nothing"), "flowchart TD")).toBe("That Mermaid text has nothing to draw yet. Add at least one node or message.");
	});
});

describe("stroke colours of a converted diagram", () => {
	function element(id: string, type: string, box: [number, number, number, number], extra: Record<string, unknown>): SceneElement {
		return { id, type, x: box[0], y: box[1], width: box[2], height: box[3], ...extra };
	}

	test("reads hex, rgb and named colours", () => {
		expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
		expect(parseColor("#1E1E1E")).toEqual({ r: 30, g: 30, b: 30, a: 1 });
		expect(parseColor("#00000080")?.a).toBeCloseTo(0.5, 2);
		expect(parseColor("rgb(31, 32, 33)")).toEqual({ r: 31, g: 32, b: 33, a: 1 });
		expect(parseColor("rgba(0, 0, 0, 0)")).toEqual({ r: 0, g: 0, b: 0, a: 0 });
		expect(parseColor("transparent")?.a).toBe(0);
		expect(parseColor("hotpink")).toBeNull();
		expect(parseColor(undefined)).toBeNull();
	});

	test("turns black strokes white on the dark canvas, and leaves them alone on the light one", () => {
		const elements = [
			element("box", "rectangle", [0, 0, 100, 50], { strokeColor: "#000", backgroundColor: "transparent" }),
			element("label", "text", [10, 10, 80, 20], { strokeColor: "#000", containerId: "box" }),
			element("arrow", "arrow", [100, 25, 50, 0], { strokeColor: "#1e1e1e", points: [[0, 0], [50, 0]] }),
		];

		const onDark = withReadableStrokes(elements, "dark");
		const onLight = withReadableStrokes(elements, "light");

		expect(onDark.map((item) => item.strokeColor)).toEqual(["#ffffff", "#ffffff", "#ffffff"]);
		expect(onLight).toEqual(elements);
		expect(elements[0].strokeColor).toBe("#000");
	});

	test("keeps dark text that sits on a light fill, even on the dark canvas", () => {
		const elements = [
			element("card", "rectangle", [0, 0, 200, 120], { strokeColor: "#9370db", backgroundColor: "#ececff" }),
			element("title", "text", [20, 10, 100, 20], { strokeColor: "#000000" }),
			element("outside", "text", [300, 10, 100, 20], { strokeColor: "#000000" }),
		];

		const onDark = withReadableStrokes(elements, "dark");

		expect(onDark.map((item) => item.strokeColor)).toEqual(["#9370db", "#000000", "#ffffff"]);
	});

	test("darkens white strokes on the light canvas and lightens dark text on a dark fill", () => {
		const elements = [
			element("line", "line", [0, 0, 80, 0], { strokeColor: "rgb(255, 255, 255)", points: [[0, 0], [80, 0]] }),
			element("card", "rectangle", [0, 20, 200, 120], { strokeColor: "#8a8a8a", backgroundColor: "rgb(31, 32, 32)" }),
			element("title", "text", [20, 30, 100, 20], { strokeColor: "#333" }),
		];

		const onLight = withReadableStrokes(elements, "light");

		expect(onLight.map((item) => item.strokeColor)).toEqual(["#1e1e1e", "#8a8a8a", "#ffffff"]);
	});

	test("leaves images, faint fills and unknown colours untouched", () => {
		const elements = [
			element("image", "image", [0, 0, 100, 100], { strokeColor: "transparent" }),
			element("tinted", "rectangle", [0, 0, 100, 50], { strokeColor: "#ffffff", backgroundColor: "#5aa2f040" }),
			element("label", "text", [10, 10, 80, 20], { strokeColor: "#ffffff" }),
			element("named", "rectangle", [200, 0, 50, 50], { strokeColor: "hotpink", backgroundColor: "transparent" }),
		];

		expect(withReadableStrokes(elements, "dark")).toEqual(elements);
	});
});
