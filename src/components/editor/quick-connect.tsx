"use client";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

export type QuickConnectProps = {
	/** The live canvas, or null while it is loading. */
	api: ExcalidrawImperativeAPI | null;
	/** False when the canvas is read-only; the handles are then never shown. */
	enabled: boolean;
};

/**
 * "+" handles on the four sides of the selected shape that add a connected shape in that
 * direction. Rendered as an overlay positioned over the canvas container, which is
 * `position: relative`.
 */
export function QuickConnect(_props: QuickConnectProps) {
	return null;
}
