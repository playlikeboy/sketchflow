// Downloading and reading one community shape pack (.excalidrawlib file).

import type { LibraryItem } from "@excalidraw/excalidraw/types";

import type { SceneElement } from "@/lib/canvas-insert-geometry";

/** The elements of one library item, as Excalidraw types them. */
export type LibraryElements = LibraryItem["elements"];

/** What is needed to open a pack: where its file is, and what to call it. */
export type PackRef = {
	source: string;
	name: string;
	author: string | null;
};

export type PackItem = {
	/** Unique within the pack, even when the file repeats an item id. */
	key: string;
	/** The item's own name. Empty when its author gave it none. */
	name: string;
	elements: LibraryElements;
};

export type LoadedPack = {
	source: string;
	items: readonly PackItem[];
};

/** A pack could not be opened. The message is written for the person using the app. */
export class PackLoadError extends Error {}

/**
 * The one place library elements are handed to the canvas-insert helpers, which read
 * elements through their own minimal `SceneElement` shape.
 */
export function asSceneElements(elements: LibraryElements): readonly SceneElement[] {
	return elements as unknown as readonly SceneElement[];
}

function packFileUrl(source: string) {
	return `/api/excalidraw/libraries/file?source=${encodeURIComponent(source)}`;
}

async function downloadPack(source: string): Promise<Blob> {
	let response: Response;
	try {
		response = await fetch(packFileUrl(source));
	} catch (error) {
		throw new PackLoadError("This library could not be downloaded. Check your connection and try again.", { cause: error });
	}

	if (!response.ok) {
		throw new PackLoadError(
			response.status === 400
				? "This library is no longer available."
				: "This library could not be downloaded right now. Try again in a moment.",
		);
	}

	return response.blob();
}

/** Downloads a pack and reads its items. Rejects with a PackLoadError. */
export async function loadPack(source: string): Promise<LoadedPack> {
	const blob = await downloadPack(source);

	try {
		// Excalidraw only runs in the browser, so it is loaded on demand.
		const { loadLibraryFromBlob } = await import("@excalidraw/excalidraw");
		const items = await loadLibraryFromBlob(blob, "published");

		return {
			source,
			items: items
				.filter((item) => item.elements.length > 0)
				.map((item, index) => ({ key: `${index}:${item.id}`, name: item.name?.trim() ?? "", elements: item.elements })),
		};
	} catch (error) {
		throw new PackLoadError("This library file could not be read. It may be damaged.", { cause: error });
	}
}
