"use client";

// Browser-side half of the Diagrams tab: turns a starter diagram or Mermaid text into real
// Excalidraw elements and puts them on the canvas. Excalidraw and the Mermaid converter both
// touch the DOM (and Mermaid is large), so they are imported only when they are needed.

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { insertElements } from "@/lib/canvas-insert";
import { elementsBounds, type SceneElement } from "@/lib/canvas-insert-geometry";
import { toConvertibleSkeletons, type DiagramTemplate, type DiagramTheme } from "@/lib/diagram-templates";
import { withReadableStrokes } from "@/lib/diagram-templates/contrast";
import { EmptyDiagramError, MermaidUnavailableError } from "@/lib/diagram-templates/mermaid";

type ExcalidrawModule = typeof import("@excalidraw/excalidraw");
type SkeletonInput = Parameters<ExcalidrawModule["convertToExcalidrawElements"]>[0];
type BinaryFiles = Parameters<ExcalidrawImperativeAPI["addFiles"]>[0];

// What `parseMermaidToExcalidraw` resolves to. Its own typings point at a path that this
// version of Excalidraw does not ship, so the parts used here are described locally.
type MermaidFile = { id: string; dataURL: string; mimeType: string; created?: number };
type MermaidConversion = { elements: readonly unknown[]; files?: Record<string, MermaidFile> };
type MermaidConverter = (definition: string, config?: { theme: "default" | "dark" }) => Promise<MermaidConversion>;

/** A Mermaid diagram is inserted at its own size, within these limits (longest side). */
const MERMAID_MIN_SIZE = 320;
const MERMAID_MAX_SIZE = 800;

// The one place plain skeleton data is handed to Excalidraw's own skeleton type.
async function skeletonsToElements(skeletons: readonly unknown[]): Promise<SceneElement[]> {
	const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
	return convertToExcalidrawElements(skeletons as unknown as SkeletonInput) as unknown as SceneElement[];
}

/** Adds a starter diagram to the middle of the view as editable shapes with bound arrows. */
export async function insertTemplate(api: ExcalidrawImperativeAPI, template: DiagramTemplate, theme: DiagramTheme) {
	const elements = await skeletonsToElements(toConvertibleSkeletons(template.build(theme)));
	return insertElements(api, elements, { targetSize: template.targetSize });
}

async function loadMermaidConverter(): Promise<MermaidConverter> {
	try {
		const converter = await import("@excalidraw/mermaid-to-excalidraw");
		return converter.parseMermaidToExcalidraw as unknown as MermaidConverter;
	} catch (cause) {
		throw new MermaidUnavailableError("The Mermaid converter could not be loaded.", { cause });
	}
}

function mermaidTargetSize(elements: readonly SceneElement[]) {
	const bounds = elementsBounds(elements);
	const naturalSize = bounds ? Math.max(bounds.width, bounds.height) : MERMAID_MAX_SIZE;
	return Math.min(MERMAID_MAX_SIZE, Math.max(MERMAID_MIN_SIZE, naturalSize));
}

export type MermaidInsertResult = {
	/** True when Mermaid could only render this kind of diagram as a single picture. */
	isImage: boolean;
};

/**
 * Converts Mermaid text and adds the result to the middle of the view. Throws the parser's
 * error for invalid text; `describeMermaidError` turns that into a sentence for the person.
 */
export async function insertMermaid(api: ExcalidrawImperativeAPI, text: string, theme: DiagramTheme): Promise<MermaidInsertResult> {
	const parseMermaidToExcalidraw = await loadMermaidConverter();
	// Mermaid's own theme matters for the kinds that come back as a picture: its default theme
	// draws dark lines on a clear background, which would vanish on the dark canvas.
	const conversion = await parseMermaidToExcalidraw(text, { theme: theme === "dark" ? "dark" : "default" });
	if (conversion.elements.length === 0) {
		throw new EmptyDiagramError("The Mermaid text produced no shapes.");
	}

	const files = Object.values(conversion.files ?? {});
	if (files.length > 0) {
		api.addFiles(files.map((file) => ({ ...file, created: file.created ?? Date.now() })) as unknown as BinaryFiles);
	}

	const elements = withReadableStrokes(await skeletonsToElements(conversion.elements), theme);
	await insertElements(api, elements, { targetSize: mermaidTargetSize(elements) });
	return { isImage: elements.every((element) => element.type === "image") };
}
