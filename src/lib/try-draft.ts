import { deleteDraft, getDraft } from "@/lib/indexeddb";
import type { SketchScene } from "@/lib/api";
import { LOCAL_WORKSPACE_ID, createLocalProject, listGuestProjects } from "@/lib/local-workspace";
import { draftKey } from "@/lib/storage-keys";

/**
 * The scratch sketch older builds kept behind /try. That page now opens the guest workspace,
 * so a leftover draft is moved into a guest project once and then removed.
 */
const TRY_DRAFT_KEY = draftKey("try", "scratch", "sketch");
const TRY_NOTES_KEY = `${TRY_DRAFT_KEY}:notes`;
const MIGRATED_PROJECT_TITLE = "Scratch sketch";

/** `touched` is set once the visitor has actually drawn or typed, as opposed to just viewing the sample. */
type TrySceneDraft = { scene: SketchScene; updatedAt: string; touched?: boolean };
type TryNotesDraft = { notes: string; updatedAt: string };

/** The sample notes /try started with; notes equal to these were never edited. */
const TRY_SAMPLE_NOTES = `# My first sketch

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

async function runTryDraftMigration() {
	const draft = await readTryDraft();
	if (!draft.touched || !tryDraftHasContent(draft)) {
		return false;
	}

	const existing = await listGuestProjects();
	await createLocalProject({
		workspaceId: LOCAL_WORKSPACE_ID,
		title: MIGRATED_PROJECT_TITLE,
		visibility: "private",
		takenIds: existing.map((project) => project.id),
		scene: draft.scene,
		notes: draft.notes,
	});
	await clearTryDraft();
	return true;
}

let pendingMigration: Promise<boolean> | null = null;

/**
 * Moves a leftover /try sketch into the guest workspace as "Scratch sketch". Runs at most once
 * per page load, so a double-mounted effect cannot create two copies. Resolves true when a
 * project was created.
 */
export function migrateTryDraftToGuestProject() {
	pendingMigration ??= runTryDraftMigration().catch((error: unknown) => {
		pendingMigration = null;
		throw error;
	});
	return pendingMigration;
}
