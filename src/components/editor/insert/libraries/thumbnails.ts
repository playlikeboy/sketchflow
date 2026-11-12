// Preview pictures for library items.
//
// Drawing an item is real work on the main thread (Excalidraw renders every stroke), so
// previews are drawn one at a time with a painted frame in between, and only when asked
// for. Each finished preview is kept for as long as its pack stays loaded.

import { prepareElementsForInsert } from "@/lib/canvas-insert-geometry";

import { asSceneElements, type LibraryElements } from "@/components/editor/insert/libraries/pack";
import { createTaskQueue } from "@/components/editor/insert/libraries/task-queue";

/** How many previews may be drawn at the same time. Drawing is synchronous, so more would not be faster. */
const MAX_CONCURRENT_RENDERS = 1;

/**
 * Previews are always drawn in light colours. In the dark theme the <img> is shown through
 * this filter, the same one Excalidraw uses for its own dark mode.
 */
export const DARK_PREVIEW_FILTER = "invert(93%) hue-rotate(180deg)";

/** Resolves after the browser has painted a frame and handled waiting input. */
function giveBrowserATurn() {
	return new Promise<void>((resolve) => {
		const afterFrame = () => setTimeout(resolve, 0);
		if (typeof requestAnimationFrame === "undefined") afterFrame();
		else requestAnimationFrame(afterFrame);
	});
}

const queue = createTaskQueue({
	concurrency: MAX_CONCURRENT_RENDERS,
	pause: giveBrowserATurn,
	onError: (error) => console.warn("A library preview task failed:", error),
});

// Both keyed by the item's element list, so they are freed together with their pack.
const rendered = new WeakMap<LibraryElements, string>();
const drawing = new WeakMap<LibraryElements, Promise<string | null>>();

async function renderThumbnail(elements: LibraryElements): Promise<string> {
	const { exportToSvg } = await import("@excalidraw/excalidraw");

	// Drawn exactly as it will be inserted: scaled to the standard insert size. A 4000px
	// drawing and a 10px one then get the same margins and honest line weights.
	let nextId = 0;
	const sized = prepareElementsForInsert(asSceneElements(elements), {
		center: { x: 0, y: 0 },
		createId: () => `preview-${nextId++}`,
	});
	if (sized.length === 0) {
		throw new Error("The item has nothing to draw.");
	}

	const svg = await exportToSvg({
		elements: sized as unknown as LibraryElements,
		appState: { exportBackground: false, exportWithDarkMode: false },
		files: null,
		// Embedding font files would add megabytes; a preview can use a fallback font.
		skipInliningFonts: true,
	});

	// Shown through an <img>, where scripts and external references inside the SVG are inert.
	const markup = new XMLSerializer().serializeToString(svg);
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}

/** Draws and remembers one preview. Resolves with null, never rejects, when it cannot be drawn. */
async function draw(elements: LibraryElements): Promise<string | null> {
	try {
		const src = await renderThumbnail(elements);
		rendered.set(elements, src);
		return src;
	} catch (error) {
		console.warn("A library item preview could not be drawn:", error);
		return null;
	} finally {
		drawing.delete(elements);
	}
}

/** The preview for an item if it was already drawn, as an image URL. */
export function cachedThumbnail(elements: LibraryElements): string | null {
	return rendered.get(elements) ?? null;
}

/**
 * Asks for an item's preview. `onDone` gets the image URL, or null when the item could not
 * be drawn. The returned function cancels the request (and skips the work if it has not
 * started), so previews for items scrolled out of view do not hold up visible ones. An item
 * is never drawn twice: a finished or already-started preview is reused.
 */
export function requestThumbnail(elements: LibraryElements, onDone: (src: string | null) => void): () => void {
	let wanted = true;
	const deliver = (src: string | null) => {
		if (wanted) onDone(src);
	};
	const cancel = () => {
		wanted = false;
	};

	const finished = rendered.get(elements);
	if (finished !== undefined) {
		queueMicrotask(() => deliver(finished));
		return cancel;
	}

	const started = drawing.get(elements);
	if (started) {
		void started.then(deliver);
		return cancel;
	}

	const withdraw = queue.enqueue(async () => {
		const work = draw(elements);
		drawing.set(elements, work);
		deliver(await work);
	});

	return () => {
		cancel();
		withdraw();
	};
}
