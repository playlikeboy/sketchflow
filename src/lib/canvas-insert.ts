"use client";

// Browser-side helpers that put things on the Excalidraw canvas. Every Insert-panel source
// (libraries, logos, photos, stickers, diagrams, uploads) goes through these two functions,
// so everything lands in the middle of the view, at one size, selected, and undoable.

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import {
	DEFAULT_INSERT_SIZE,
	fitSize,
	prepareElementsForInsert,
	svgDimensions,
	viewportCenter,
	type SceneElement,
} from "@/lib/canvas-insert-geometry";

type SceneElements = Parameters<ExcalidrawImperativeAPI["updateScene"]>[0]["elements"];
type BinaryFile = Parameters<ExcalidrawImperativeAPI["addFiles"]>[0][number];

/** Largest side, in pixels, of a raster image stored in a sketch. Keeps saved files small. */
export const MAX_EMBEDDED_IMAGE_DIMENSION = 1600;
const EMBEDDED_JPEG_QUALITY = 0.85;

function createId() {
	return crypto.randomUUID().replace(/-/g, "").slice(0, 20);
}

async function addToScene(api: ExcalidrawImperativeAPI, elements: SceneElement[]) {
	if (elements.length === 0) return;
	const { CaptureUpdateAction } = await import("@excalidraw/excalidraw");

	api.updateScene({
		elements: [...api.getSceneElements(), ...elements] as unknown as SceneElements,
		appState: { selectedElementIds: Object.fromEntries(elements.map((element) => [element.id, true as const])) },
		// Recorded as one step, so a single undo removes the whole insert.
		captureUpdate: CaptureUpdateAction.IMMEDIATELY,
	});
}

export type InsertOptions = {
	/** Longest side of the inserted item in scene units. Defaults to DEFAULT_INSERT_SIZE. */
	targetSize?: number;
};

/**
 * Adds a copy of `elements` (for example one library item, or a diagram template) to the
 * centre of the visible canvas, scaled to a consistent size, with fresh ids.
 */
export async function insertElements(api: ExcalidrawImperativeAPI, elements: readonly SceneElement[], options: InsertOptions = {}) {
	const prepared = prepareElementsForInsert(elements, {
		center: viewportCenter(api.getAppState()),
		targetSize: options.targetSize ?? DEFAULT_INSERT_SIZE,
		createId,
	});
	await addToScene(api, prepared);
	return prepared.length;
}

export type InsertImageInput = {
	/** A `data:` URL. The image is stored inside the sketch, so it must not be a remote URL. */
	dataUrl: string;
	mimeType: "image/svg+xml" | "image/png" | "image/jpeg" | "image/webp" | "image/gif";
	/** Intrinsic size of the image, used for its aspect ratio. */
	width: number;
	height: number;
	/** Optional link opened from the element, for example a photo's credit page. */
	link?: string;
} & InsertOptions;

/** Adds an image to the centre of the visible canvas at a consistent size. */
export async function insertImage(api: ExcalidrawImperativeAPI, input: InsertImageInput) {
	if (!input.dataUrl.startsWith("data:")) {
		throw new Error("Images must be embedded as data URLs before they are inserted.");
	}

	const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
	const fileId = createId();
	const size = fitSize({ width: input.width, height: input.height }, input.targetSize ?? DEFAULT_INSERT_SIZE);
	const center = viewportCenter(api.getAppState());

	api.addFiles([{ id: fileId, dataURL: input.dataUrl, mimeType: input.mimeType, created: Date.now() } as unknown as BinaryFile]);

	const [image] = convertToExcalidrawElements([
		{
			type: "image",
			fileId: fileId as never,
			x: center.x - size.width / 2,
			y: center.y - size.height / 2,
			width: size.width,
			height: size.height,
			...(input.link ? { link: input.link } : {}),
		},
	]);

	await addToScene(api, [{ ...(image as unknown as SceneElement), status: "saved" }]);
}

/** Encodes SVG markup as a data URL, and reports its intrinsic size (24×24 when it declares none). */
export function svgToImage(svg: string) {
	const size = svgDimensions(svg) ?? { width: 24, height: 24 };
	const bytes = new TextEncoder().encode(svg);
	const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
	return { dataUrl: `data:image/svg+xml;base64,${btoa(binary)}`, mimeType: "image/svg+xml" as const, ...size };
}

function readAsDataUrl(blob: Blob) {
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(new Error("The image could not be read."));
		reader.readAsDataURL(blob);
	});
}

/**
 * Turns a raster image into an embeddable JPEG or PNG data URL, shrinking it so its longest
 * side is at most `maxDimension`. Photos would otherwise add megabytes to every saved sketch.
 */
export async function rasterToImage(blob: Blob, options: { maxDimension?: number; keepTransparency?: boolean } = {}) {
	const bitmap = await createImageBitmap(blob);
	const maxDimension = options.maxDimension ?? MAX_EMBEDDED_IMAGE_DIMENSION;
	const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
	const width = Math.max(1, Math.round(bitmap.width * scale));
	const height = Math.max(1, Math.round(bitmap.height * scale));

	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext("2d");
	if (!context) {
		bitmap.close();
		throw new Error("This browser could not prepare the image.");
	}
	context.drawImage(bitmap, 0, 0, width, height);
	bitmap.close();

	const mimeType = options.keepTransparency ? ("image/png" as const) : ("image/jpeg" as const);
	const encoded = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mimeType, EMBEDDED_JPEG_QUALITY));
	if (!encoded) {
		throw new Error("This browser could not prepare the image.");
	}

	return { dataUrl: await readAsDataUrl(encoded), mimeType, width, height };
}
