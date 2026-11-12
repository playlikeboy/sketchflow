// Pure logic for presenting a sketch's frames as slides. No Excalidraw import, so it runs in tests.
//
// A slide is one frame. Frames are read like a page: rows from top to bottom, and left to right
// within a row. A sketch without frames is presented whole, as a single slide.

/** The parts of a frame this module reads. */
export type SlideFrame = {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	name?: string | null;
};

/** The parts of any canvas element needed to build a deck. */
export type DeckElement = SlideFrame & { type: string };

/** One step of the presentation. `frameId` is null when the slide is the whole sketch. */
export type Slide = { frameId: string | null; title: string };

/** What there is to present: the sketch's frames, the sketch as one slide, or nothing. */
export type Deck = { kind: "frames" | "whole" | "empty"; slides: readonly Slide[] };

export type SlideAction = "next" | "previous" | "first" | "last" | "exit";
export type SlideNavigation = Exclude<SlideAction, "exit">;

export type Size = { width: number; height: number };

/** The title of the single slide shown when a sketch has no frames. */
export const WHOLE_SKETCH_TITLE = "Whole sketch";

const FRAME_TYPE = "frame";

/** Two frames share a row when they overlap by more than this share of the smaller one's height. */
const ROW_OVERLAP_SHARE = 0.5;

const KEY_ACTIONS: Readonly<Record<string, SlideAction>> = {
	ArrowRight: "next",
	PageDown: "next",
	" ": "next",
	Enter: "next",
	ArrowLeft: "previous",
	PageUp: "previous",
	Backspace: "previous",
	Home: "first",
	End: "last",
	Escape: "exit",
};

function topOf(frame: SlideFrame): number {
	return Math.min(frame.y, frame.y + frame.height);
}

function bottomOf(frame: SlideFrame): number {
	return Math.max(frame.y, frame.y + frame.height);
}

function leftOf(frame: SlideFrame): number {
	return Math.min(frame.x, frame.x + frame.width);
}

function compareIds(a: SlideFrame, b: SlideFrame): number {
	if (a.id === b.id) return 0;
	return a.id < b.id ? -1 : 1;
}

function compareTopDown(a: SlideFrame, b: SlideFrame): number {
	return topOf(a) - topOf(b) || leftOf(a) - leftOf(b) || compareIds(a, b);
}

function compareLeftToRight(a: SlideFrame, b: SlideFrame): number {
	return leftOf(a) - leftOf(b) || topOf(a) - topOf(b) || compareIds(a, b);
}

function sharesRow(a: SlideFrame, b: SlideFrame): boolean {
	const overlap = Math.min(bottomOf(a), bottomOf(b)) - Math.max(topOf(a), topOf(b));
	const smallerHeight = Math.min(Math.abs(a.height), Math.abs(b.height));
	return overlap > smallerHeight * ROW_OVERLAP_SHARE;
}

/** Adds a frame to the highest row whose first (top-most) frame it shares a row with. */
function addToRows<T extends SlideFrame>(rows: readonly (readonly T[])[], frame: T): readonly (readonly T[])[] {
	const rowIndex = rows.findIndex((row) => sharesRow(row[0], frame));
	if (rowIndex === -1) return [...rows, [frame]];
	return rows.map((row, index) => (index === rowIndex ? [...row, frame] : row));
}

/**
 * Frames in reading order: rows from top to bottom, then left to right within a row. Two frames
 * are in the same row when their vertical ranges overlap by more than half of the smaller
 * frame's height. Ties are broken by x, then by id, so the order never depends on the input order.
 */
export function orderSlides<T extends SlideFrame>(frames: readonly T[]): T[] {
	const rows = [...frames].sort(compareTopDown).reduce<readonly (readonly T[])[]>(addToRows, []);
	return rows.flatMap((row) => [...row].sort(compareLeftToRight));
}

/** The frame's name, or "Slide N" (counting from one) when it has none. */
export function slideTitle(frame: Pick<SlideFrame, "name">, index: number): string {
	return frame.name?.trim() || `Slide ${index + 1}`;
}

export function firstSlideIndex(): number {
	return 0;
}

export function lastSlideIndex(count: number): number {
	return Math.max(0, count - 1);
}

function clampSlideIndex(index: number, count: number): number {
	if (!Number.isFinite(index)) return firstSlideIndex();
	return Math.min(Math.max(index, firstSlideIndex()), lastSlideIndex(count));
}

/** The slide after this one. Stays on the last slide rather than wrapping round. */
export function nextSlideIndex(index: number, count: number): number {
	return clampSlideIndex(clampSlideIndex(index, count) + 1, count);
}

/** The slide before this one. Stays on the first slide rather than wrapping round. */
export function previousSlideIndex(index: number, count: number): number {
	return clampSlideIndex(clampSlideIndex(index, count) - 1, count);
}

/** What a key press does while presenting, or null when the key is not the presentation's. */
export function slideActionForKey(key: string): SlideAction | null {
	return Object.hasOwn(KEY_ACTIONS, key) ? KEY_ACTIONS[key] : null;
}

/** The slide a navigation action lands on. */
export function slideIndexAfter(action: SlideNavigation, index: number, count: number): number {
	if (action === "next") return nextSlideIndex(index, count);
	if (action === "previous") return previousSlideIndex(index, count);
	if (action === "first") return firstSlideIndex();
	return lastSlideIndex(count);
}

/** "3 / 12", for the control bar. */
export function slidePositionLabel(index: number, count: number): string {
	return `${index + 1} / ${count}`;
}

/** "Slide 3 of 12: Roadmap", for screen readers. */
export function slideAnnouncement(index: number, count: number, title: string): string {
	return `Slide ${index + 1} of ${count}: ${title}`;
}

/** The slides for a sketch: its frames in reading order, else the whole sketch, else nothing. */
export function buildDeck(elements: readonly DeckElement[]): Deck {
	if (elements.length === 0) return { kind: "empty", slides: [] };

	const frames = orderSlides(elements.filter((element) => element.type === FRAME_TYPE));
	if (frames.length === 0) return { kind: "whole", slides: [{ frameId: null, title: WHOLE_SKETCH_TITLE }] };

	return { kind: "frames", slides: frames.map((frame, index) => ({ frameId: frame.id, title: slideTitle(frame, index) })) };
}

/**
 * The zoom at which a frame fills `fill` (0 to 1) of the viewport along its limiting side, or
 * null when either has no area.
 */
export function slideFitZoom(frame: Size, viewport: Size, fill: number): number | null {
	const frameWidth = Math.abs(frame.width);
	const frameHeight = Math.abs(frame.height);
	const lengths = [frameWidth, frameHeight, viewport.width, viewport.height, fill];
	if (!lengths.every((length) => Number.isFinite(length) && length > 0)) return null;

	return Math.min(viewport.width / frameWidth, viewport.height / frameHeight) * fill;
}
