// The guest workspace: everything a person makes before (or without) connecting GitHub.
//
// Sketchflow is local first. Projects, sketches and notes are written to this browser's
// IndexedDB the moment they change, whether or not anyone is signed in. A GitHub repository
// is an optional backup and sharing target, never a precondition for using the app.
//
// Guest data always lives under the "local" storage scope, even after the person signs in,
// so signing in or out can never hide or purge it. It leaves this browser only when the person
// syncs it into a repository (see src/lib/local-sync.ts).

import type { SketchScene, Workspace } from "@/lib/api";
import { getLocalProjects, saveLocalProject, setDraft } from "@/lib/indexeddb";
import type { ProjectVisibility, WorkspaceProject } from "@/lib/project-metadata";
import { humanizeSlug, notesFilePath, projectFilePath, sketchFilePath, slugify } from "@/lib/sketchflow";
import { draftKey } from "@/lib/storage-keys";
import { DEFAULT_SKETCH_ID } from "@/lib/workspace-routes";

export const LOCAL_WORKSPACE_ID = "local";
export const LOCAL_WORKSPACE_LABEL = "This device";

const EPOCH = new Date(0).toISOString();

/** A stand-in Workspace for the guest workspace, so list and editor code can treat it uniformly. */
export const LOCAL_WORKSPACE: Workspace = {
	id: LOCAL_WORKSPACE_ID,
	stackUserId: "",
	repoOwner: "",
	repoName: "",
	defaultBranch: "main",
	visibility: "private",
	latestCommitSha: null,
	createdAt: EPOCH,
	updatedAt: EPOCH,
};

export function isLocalWorkspace(workspaceId: string | null | undefined) {
	return workspaceId === LOCAL_WORKSPACE_ID;
}

/** "This device" for the guest workspace, otherwise "owner/repo". */
export function workspaceLabel(workspace: Pick<Workspace, "id" | "repoOwner" | "repoName">) {
	return isLocalWorkspace(workspace.id) ? LOCAL_WORKSPACE_LABEL : `${workspace.repoOwner}/${workspace.repoName}`;
}

/**
 * The user id that scopes browser storage for a workspace. Guest-workspace data is always
 * stored under the "local" scope (null here), whoever is signed in.
 */
export function storageUserId(workspaceId: string | null | undefined, userId: string | null | undefined) {
	return isLocalWorkspace(workspaceId) ? null : (userId ?? null);
}

/** A slug for `title` that is not already in `takenIds`: "my-map", then "my-map-2", "my-map-3", ... */
export function uniqueProjectId(title: string, takenIds: Iterable<string>) {
	const taken = new Set(takenIds);
	const base = slugify(title);
	let candidate = base;
	for (let suffix = 2; taken.has(candidate); suffix += 1) {
		candidate = `${base}-${suffix}`;
	}
	return candidate;
}

export type LocalProjectInput = {
	projectId: string;
	title: string;
	description?: string;
	visibility: ProjectVisibility;
	now: string;
};

/** The metadata record for a project that so far exists only in this browser. */
export function buildLocalProject(input: LocalProjectInput): WorkspaceProject {
	const sketchFile = sketchFilePath(input.projectId, DEFAULT_SKETCH_ID);
	const isPublic = input.visibility === "public";

	return {
		id: input.projectId,
		title: input.title,
		description: input.description || undefined,
		visibility: input.visibility,
		createdAt: input.now,
		updatedAt: input.now,
		defaultSketch: sketchFile,
		defaultSketchId: DEFAULT_SKETCH_ID,
		notesFile: notesFilePath(input.projectId),
		projectFile: projectFilePath(input.projectId),
		sketches: [{ id: DEFAULT_SKETCH_ID, title: humanizeSlug(DEFAULT_SKETCH_ID), file: sketchFile }],
		sharing: { enabled: isPublic, embed: isPublic },
		isLocalOnly: true,
	};
}

export const EMPTY_SCENE: SketchScene = {
	type: "excalidraw",
	version: 2,
	source: "https://sketchflow.space",
	elements: [],
	appState: { viewBackgroundColor: "#000000" },
	files: {},
};

export function defaultNotes(title: string) {
	return `# ${title}\n\nProject documentation and notes.\n`;
}

export type CreateLocalProjectInput = {
	workspaceId: string;
	/** The signed-in user, if any. Ignored for the guest workspace. */
	userId?: string | null;
	title: string;
	description?: string;
	visibility: ProjectVisibility;
	/** Ids already used in this workspace; the new project gets a fresh one. */
	takenIds: Iterable<string>;
	scene?: SketchScene | null;
	notes?: string | null;
};

/**
 * Writes a new project, its first sketch, its notes and its editor state to IndexedDB.
 * This is the whole of "creating a project" for the guest workspace; repository workspaces
 * additionally queue a commit afterwards.
 */
export async function createLocalProject(input: CreateLocalProjectInput) {
	const now = new Date().toISOString();
	const title = input.title.trim() || "Untitled Project";
	const projectId = uniqueProjectId(title, input.takenIds);
	const scopeUserId = storageUserId(input.workspaceId, input.userId);
	const project = buildLocalProject({ projectId, title, description: input.description?.trim(), visibility: input.visibility, now });
	const sketchDraftKey = draftKey(input.workspaceId, projectId, DEFAULT_SKETCH_ID, scopeUserId);

	await Promise.all([
		setDraft(sketchDraftKey, { scene: input.scene ?? EMPTY_SCENE, updatedAt: now }),
		setDraft(`${sketchDraftKey}:notes`, { notes: input.notes?.trim() ? input.notes : defaultNotes(title), updatedAt: now }),
		setDraft(`${sketchDraftKey}:state`, {
			state: { viewMode: "split", lastActiveSketchId: DEFAULT_SKETCH_ID, panelSizes: [50, 50] },
			updatedAt: now,
		}),
		saveLocalProject(input.workspaceId, project, scopeUserId),
	]);

	return { projectId, sketchId: DEFAULT_SKETCH_ID, project };
}

/** Projects in the guest workspace, newest first. */
export async function listGuestProjects(): Promise<WorkspaceProject[]> {
	const projects = (await getLocalProjects(LOCAL_WORKSPACE_ID, null)) as WorkspaceProject[];
	return [...projects].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}
