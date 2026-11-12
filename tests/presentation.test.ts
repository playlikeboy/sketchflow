import { expect, test } from "bun:test";

import {
	buildDeck,
	firstSlideIndex,
	lastSlideIndex,
	nextSlideIndex,
	orderSlides,
	previousSlideIndex,
	slideActionForKey,
	slideAnnouncement,
	slideFitZoom,
	slideIndexAfter,
	slidePositionLabel,
	slideTitle,
	WHOLE_SKETCH_TITLE,
	type DeckElement,
	type SlideFrame,
} from "../src/lib/presentation";

function frame(id: string, x: number, y: number, width = 400, height = 300, name: string | null = null): SlideFrame {
	return { id, x, y, width, height, name };
}

function ids(frames: readonly SlideFrame[]) {
	return frames.map((item) => item.id);
}

function element(id: string, type: string, x = 0, y = 0): DeckElement {
	return { id, type, x, y, width: 400, height: 300 };
}

test("orders a grid of frames row by row, left to right", () => {
	const frames = [frame("d", 500, 400), frame("b", 500, 0), frame("c", 0, 400), frame("a", 0, 0)];

	expect(ids(orderSlides(frames))).toEqual(["a", "b", "c", "d"]);
});

test("keeps hand-placed frames in one row when they overlap by more than half the smaller height", () => {
	// "b" sits 120 lower than "a": they share 180 of 300, which is more than half.
	const frames = [frame("b", 500, 120), frame("a", 0, 0), frame("c", 1000, 40)];

	expect(ids(orderSlides(frames))).toEqual(["a", "b", "c"]);
});

test("starts a new row when the overlap is exactly half or less", () => {
	// "low" shares exactly 150 of 300 with "top": not more than half, so it is a row of its own
	// even though it is further left.
	const frames = [frame("top", 500, 0), frame("low", 0, 150)];

	expect(ids(orderSlides(frames))).toEqual(["top", "low"]);
});

test("measures the overlap against the smaller frame", () => {
	// The small frame lies wholly inside the tall one's vertical range, so they share a row.
	const frames = [frame("small", 0, 600, 200, 100), frame("tall", 300, 0, 400, 1000)];

	expect(ids(orderSlides(frames))).toEqual(["small", "tall"]);
});

test("reads a column stacked beside a tall frame top to bottom", () => {
	const frames = [frame("lower", 600, 500, 300, 400), frame("upper", 600, 0, 300, 400), frame("tall", 0, 0, 400, 1000)];

	expect(ids(orderSlides(frames))).toEqual(["tall", "upper", "lower"]);
});

test("breaks ties by x, then by id, whatever order the frames arrive in", () => {
	const frames = [frame("z", 0, 0), frame("m", 0, 0), frame("a", 0, 0), frame("b", -50, 0)];

	expect(ids(orderSlides(frames))).toEqual(["b", "a", "m", "z"]);
	expect(ids(orderSlides([...frames].reverse()))).toEqual(["b", "a", "m", "z"]);
});

test("orders rows by where they start, with a frame joining the highest row it fits", () => {
	const frames = [frame("row2-b", 500, 420), frame("row1-b", 500, 30), frame("row2-a", 0, 400), frame("row1-a", 0, 0)];

	expect(ids(orderSlides(frames))).toEqual(["row1-a", "row1-b", "row2-a", "row2-b"]);
});

test("handles no frames, one frame, and frames with no height", () => {
	expect(orderSlides([])).toEqual([]);
	expect(ids(orderSlides([frame("only", 5, 5)]))).toEqual(["only"]);
	expect(ids(orderSlides([frame("flat-b", 100, 0, 400, 0), frame("flat-a", 0, 0, 400, 0)]))).toEqual(["flat-a", "flat-b"]);
});

test("treats a frame drawn with a negative height as the box it covers", () => {
	// "up" was dragged upwards from y=300, so it covers 0..300 just like "a".
	const frames = [frame("up", 500, 300, 400, -300), frame("a", 0, 0)];

	expect(ids(orderSlides(frames))).toEqual(["a", "up"]);
});

test("does not change the list it is given and keeps the original objects", () => {
	const first = frame("b", 500, 0);
	const second = frame("a", 0, 0);
	const frames = [first, second];

	const ordered = orderSlides(frames);

	expect(frames).toEqual([first, second]);
	expect(ordered[0]).toBe(second);
	expect(ordered[1]).toBe(first);
});

test("titles a slide with the frame's name, or its number", () => {
	expect(slideTitle(frame("a", 0, 0, 400, 300, "Roadmap"), 0)).toBe("Roadmap");
	expect(slideTitle(frame("a", 0, 0, 400, 300, "  Padded  "), 4)).toBe("Padded");
	expect(slideTitle(frame("a", 0, 0), 2)).toBe("Slide 3");
	expect(slideTitle(frame("a", 0, 0, 400, 300, "   "), 0)).toBe("Slide 1");
	expect(slideTitle({}, 11)).toBe("Slide 12");
});

test("moves forward and back without wrapping at either end", () => {
	expect(nextSlideIndex(0, 3)).toBe(1);
	expect(nextSlideIndex(2, 3)).toBe(2);
	expect(previousSlideIndex(2, 3)).toBe(1);
	expect(previousSlideIndex(0, 3)).toBe(0);
});

test("jumps to the first and last slide", () => {
	expect(firstSlideIndex()).toBe(0);
	expect(lastSlideIndex(12)).toBe(11);
	expect(lastSlideIndex(1)).toBe(0);
});

test("stays on slide one when there are no slides or the index is out of range", () => {
	expect(lastSlideIndex(0)).toBe(0);
	expect(nextSlideIndex(0, 0)).toBe(0);
	expect(previousSlideIndex(0, 0)).toBe(0);
	expect(nextSlideIndex(99, 3)).toBe(2);
	expect(previousSlideIndex(-4, 3)).toBe(0);
	expect(nextSlideIndex(Number.NaN, 3)).toBe(1);
});

test("maps the presenter's keys to actions", () => {
	for (const key of ["ArrowRight", "PageDown", " ", "Enter"]) expect(slideActionForKey(key)).toBe("next");
	for (const key of ["ArrowLeft", "PageUp", "Backspace"]) expect(slideActionForKey(key)).toBe("previous");
	expect(slideActionForKey("Home")).toBe("first");
	expect(slideActionForKey("End")).toBe("last");
	expect(slideActionForKey("Escape")).toBe("exit");
});

test("leaves every other key alone", () => {
	for (const key of ["ArrowUp", "ArrowDown", "a", "f", "Tab", "F11", "Shift", ""]) expect(slideActionForKey(key)).toBeNull();
});

test("applies a navigation action to the current slide", () => {
	expect(slideIndexAfter("next", 1, 5)).toBe(2);
	expect(slideIndexAfter("previous", 1, 5)).toBe(0);
	expect(slideIndexAfter("first", 3, 5)).toBe(0);
	expect(slideIndexAfter("last", 1, 5)).toBe(4);
	expect(slideIndexAfter("next", 4, 5)).toBe(4);
	expect(slideIndexAfter("previous", 0, 5)).toBe(0);
});

test("labels the position for the control bar and for screen readers", () => {
	expect(slidePositionLabel(2, 12)).toBe("3 / 12");
	expect(slideAnnouncement(2, 12, "Roadmap")).toBe("Slide 3 of 12: Roadmap");
	expect(slideAnnouncement(0, 1, WHOLE_SKETCH_TITLE)).toBe("Slide 1 of 1: Whole sketch");
});

test("builds a deck from the frames on the sketch, in reading order", () => {
	const elements: DeckElement[] = [
		element("shape", "rectangle", 10, 10),
		{ ...element("second", "frame", 500, 0), name: "Plan" },
		{ ...element("first", "frame", 0, 0), name: null },
		element("text", "text", 20, 20),
	];

	expect(buildDeck(elements)).toEqual({
		kind: "frames",
		slides: [
			{ frameId: "first", title: "Slide 1" },
			{ frameId: "second", title: "Plan" },
		],
	});
});

test("presents a sketch without frames as one slide", () => {
	expect(buildDeck([element("shape", "rectangle"), element("note", "text")])).toEqual({
		kind: "whole",
		slides: [{ frameId: null, title: WHOLE_SKETCH_TITLE }],
	});
});

test("has nothing to present on an empty sketch", () => {
	expect(buildDeck([])).toEqual({ kind: "empty", slides: [] });
});

test("only real frames become slides", () => {
	const deck = buildDeck([element("ai", "magicframe"), element("shape", "rectangle")]);

	expect(deck.kind).toBe("whole");
});

test("fits a frame to the limiting side of the viewport, leaving a margin", () => {
	// Width limits: 1920 / 960 = 2, height would allow 1080 / 270 = 4.
	expect(slideFitZoom({ width: 960, height: 270 }, { width: 1920, height: 1080 }, 0.9)).toBeCloseTo(1.8);
	// Height limits: 1080 / 2160 = 0.5.
	expect(slideFitZoom({ width: 1920, height: 2160 }, { width: 1920, height: 1080 }, 0.9)).toBeCloseTo(0.45);
	expect(slideFitZoom({ width: 1920, height: 1080 }, { width: 1920, height: 1080 }, 1)).toBe(1);
});

test("cannot fit a frame or viewport with no area", () => {
	expect(slideFitZoom({ width: 0, height: 300 }, { width: 1920, height: 1080 }, 0.9)).toBeNull();
	expect(slideFitZoom({ width: 400, height: 300 }, { width: 0, height: 0 }, 0.9)).toBeNull();
	expect(slideFitZoom({ width: 400, height: Number.NaN }, { width: 1920, height: 1080 }, 0.9)).toBeNull();
	expect(slideFitZoom({ width: 400, height: 300 }, { width: 1920, height: 1080 }, 0)).toBeNull();
});

test("fits a frame drawn with negative sizes by the box it covers", () => {
	expect(slideFitZoom({ width: -960, height: -540 }, { width: 1920, height: 1080 }, 1)).toBe(2);
});
