"use client";

import dynamic from "next/dynamic";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { Loader2 } from "lucide-react";

import type { SketchScene } from "@/lib/api";
import { normalizeScene } from "@/lib/sketchflow";

const Excalidraw = dynamic(async () => (await import("@excalidraw/excalidraw")).Excalidraw, {
	ssr: false,
	loading: () => (
		<div className="grid h-full place-items-center text-sm text-muted-foreground">
			<div className="flex items-center gap-2">
				<Loader2 className="size-4 animate-spin" />
				Loading canvas
			</div>
		</div>
	),
});

function toInitialData(scene: SketchScene): ExcalidrawInitialDataState {
	return {
		elements: scene.elements as ExcalidrawInitialDataState["elements"],
		appState: scene.appState as ExcalidrawInitialDataState["appState"],
		files: scene.files as ExcalidrawInitialDataState["files"],
	};
}

export function PublicSketchViewer({ scene }: { scene: Partial<SketchScene> | null }) {
	const initialData = toInitialData(normalizeScene(scene));

	return (
		<div className="h-full min-h-[420px] overflow-hidden rounded-lg border bg-card">
			<Excalidraw initialData={initialData} viewModeEnabled />
		</div>
	);
}
