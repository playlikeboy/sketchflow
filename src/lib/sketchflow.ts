import type { SketchScene } from "@/lib/api";
import { SKETCHFLOW_APP_URL } from "@/lib/config";

export function slugify(value: string) {
	const slug = value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_.-]+/g, "-")
		.replace(/^-+|-+$/g, "");

	return slug || "untitled";
}

export function humanizeSlug(value: string) {
	return value
		.split(/[-_.]+/g)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

export function draftKey(workspaceId: string, projectId: string, sketchId: string) {
	return `sketchflow:${workspaceId}:${projectId}:${sketchId}`;
}

export function sketchFilePath(projectId: string, sketchId: string) {
	return `projects/${projectId}/sketches/${sketchId}.excalidraw.json`;
}

export function projectFilePath(projectId: string) {
	return `projects/${projectId}/project.json`;
}

export function notesFilePath(projectId: string) {
	return `projects/${projectId}/docs/notes.md`;
}

export function normalizeScene(scene: Partial<SketchScene> | null | undefined): SketchScene {
	return {
		type: scene?.type ?? "excalidraw",
		version: scene?.version ?? 2,
		source: scene?.source ?? SKETCHFLOW_APP_URL,
		elements: Array.isArray(scene?.elements) ? scene.elements : [],
		appState: {
			viewBackgroundColor: "#ffffff",
			...(scene?.appState ?? {}),
		},
		files: scene?.files ?? {},
	};
}
