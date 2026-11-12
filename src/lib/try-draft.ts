import { deleteDraft, getDraft } from "@/lib/indexeddb";
import type { SketchScene } from "@/lib/api";
import { draftKey } from "@/lib/storage-keys";

/**
 * The scratch sketch behind /try. It lives only in this browser, under the signed-out
 * "local" scope, until the visitor signs in and imports it into a project.
 */
export const TRY_DRAFT_KEY = draftKey("try", "scratch", "sketch");
export const TRY_NOTES_KEY = `${TRY_DRAFT_KEY}:notes`;

/** `touched` is set once the visitor has actually drawn or typed, as opposed to just viewing the sample. */
export type TrySceneDraft = { scene: SketchScene; updatedAt: string; touched?: boolean };
export type TryNotesDraft = { notes: string; updatedAt: string };

export const TRY_SAMPLE_NOTES = `# My first sketch

Draw on the left, write here. Everything you do is kept in this browser.

- Double-click the canvas to add text
- Press **R** for a rectangle, **A** for an arrow
- Sign in when you want this saved to a GitHub repository you own
`;

export async function readTryDraft() {
	const [scene, notes] = await Promise.all([
		getDraft<TrySceneDraft>(TRY_DRAFT_KEY),
		getDraft<TryNotesDraft>(TRY_NOTES_KEY),
	]);

	return {
		scene: scene?.value?.scene ?? null,
		notes: notes?.value?.notes ?? null,
		touched: scene?.value?.touched === true || (notes?.value?.notes != null && notes.value.notes !== TRY_SAMPLE_NOTES),
	};
}

export async function clearTryDraft() {
	await Promise.all([deleteDraft(TRY_DRAFT_KEY), deleteDraft(TRY_NOTES_KEY)]);
}

/** True when there is something in the draft worth turning into a project. */
export function tryDraftHasContent(draft: { scene: SketchScene | null; notes: string | null }) {
	const hasElements = Array.isArray(draft.scene?.elements) && draft.scene.elements.length > 0;
	return hasElements || Boolean(draft.notes?.trim());
}
