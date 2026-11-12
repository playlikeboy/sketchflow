import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

/** Props every Insert-panel tab receives. Tabs insert through src/lib/canvas-insert.ts. */
export type InsertTabProps = {
	/** The live canvas. Tabs are only rendered once it exists. */
	api: ExcalidrawImperativeAPI;
	/** Whether the app is in its dark theme, for choosing icon colours and previews. */
	isDark: boolean;
	/** The search text typed in the panel's shared search box (already trimmed). */
	query: string;
	/** Call after something was added to the canvas, with a short name for the status line. */
	onInserted: (label: string) => void;
};
