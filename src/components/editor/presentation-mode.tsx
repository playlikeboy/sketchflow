"use client";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

export type PresentationModeProps = {
	/** The live canvas, or null while it is loading. */
	api: ExcalidrawImperativeAPI | null;
	/** Whether the presentation is running. */
	active: boolean;
	/** Called when the person leaves the presentation (Escape or the close button). */
	onExit: () => void;
};

/** Steps through the sketch's frames as slides, full screen, with keyboard navigation. */
export function PresentationMode(_props: PresentationModeProps) {
	return null;
}
