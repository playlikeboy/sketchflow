// Copies guest projects (the "This device" workspace) into a repository workspace.
//
// Nothing here runs on its own: the person picks projects and confirms. Each project is written
// with one commit that also carries an updated projects-metadata.json, so the repository is never
// left with a project folder its project list does not show. Only after that commit succeeds is
// the guest copy removed from this browser; a project whose commit fails stays exactly as it was.

import {
	ApiError,
	apiJson,
	commitWorkspaceFiles,
	type CommitResponse,
	type SketchScene,
	type Workspace,
	type WorkspaceProjectsResponse,
} from "@/lib/api";
import { deleteLocalProject, getDraft, purgeProjectDrafts } from "@/lib/indexeddb";
import { LOCAL_WORKSPACE_ID, defaultNotes, listGuestProjects, uniqueProjectId } from "@/lib/local-workspace";
import {
	PROJECTS_METADATA_PATH,
	buildProjectsMetadata,
	projectFromProjectJson,
	type ProjectVisibility,
	type WorkspaceProject,
} from "@/lib/project-metadata";
import { humanizeSlug, normalizeScene, notesFilePath, projectFilePath, sketchFilePath } from "@/lib/sketchflow";
import { draftKey } from "@/lib/storage-keys";
import { DEFAULT_SKETCH_ID } from "@/lib/workspace-routes";

/**
 * Per-file limit of the commit route. Mirrors MAX_FILE_BYTES in src/server/github.ts and the
 * default of validateGithubFileChange in src/server/github-validation.ts. The route has no limit
 * on the number of files, only that there is at least one.
 */
export const MAX_COMMIT_FILE_BYTES = 8_000_000;

export type CommitFile = { path: string; content: string };

/** Everything read from this browser for one guest project. Scenes are keyed by sketch id. */
export type GuestProjectContent = {
	project: WorkspaceProject;
	scenes: Readonly<Record<string, SketchScene | null>>;
	notes: string | null;
};

export type SyncTarget = Pick<Workspace, "id" | "repoOwner" | "repoName" | "defaultBranch" | "visibility">;

export type SyncResult = {
	projectId: string;
	title: string;
	status: "synced" | "failed";
	newProjectId?: string;
	error?: string;
	/** The failure means the GitHub session is gone; signing in again fixes it. */
	needsSignIn?: boolean;
	/** The project reached the repository but something afterwards did not go to plan. */
	warning?: string;
};

export type SyncProgress = { completed: number; total: number; currentTitle: string | null };

export type RepoProjectsSnapshot = Pick<WorkspaceProjectsResponse, "projects"> & {
	workspace: Pick<Workspace, "latestCommitSha">;
};

export type LocalSyncDeps = {
	fetchRepoProjects: (workspaceId: string) => Promise<RepoProjectsSnapshot>;
	commitFiles: (input: {
		workspaceId: string;
		message: string;
		files: CommitFile[];
		expectedHeadSha?: string | null;
	}) => Promise<Pick<CommitResponse, "commit">>;
	listGuestProjects: () => Promise<WorkspaceProject[]>;
	/** The stored value of a browser draft, or null. */
	readDraft: (key: string) => Promise<unknown>;
	/** Removes a guest project and all of its drafts from this browser. */
	removeGuestProject: (projectId: string) => Promise<void>;
	now: () => string;
};

export type SyncGuestProjectsInput = {
	workspace: SyncTarget;
	projectIds: readonly string[];
	onProgress?: (progress: SyncProgress) => void;
};

// ---------------------------------------------------------------------------------------------
// Building the files
// ---------------------------------------------------------------------------------------------

function jsonFile(path: string, value: unknown): CommitFile {
	return { path, content: `${JSON.stringify(value, null, 2)}\n` };
}

function guestSketches(project: WorkspaceProject) {
	const seen = new Set<string>();
	const sketches = (project.sketches ?? []).filter((sketch) => {
		if (!sketch?.id || seen.has(sketch.id)) return false;
		seen.add(sketch.id);
		return true;
	});
	if (sketches.length > 0) {
		return sketches.map((sketch) => ({ id: sketch.id, title: sketch.title || humanizeSlug(sketch.id) }));
	}
	const id = project.defaultSketchId || DEFAULT_SKETCH_ID;
	return [{ id, title: humanizeSlug(id) }];
}

function notesContent(notes: string | null, title: string) {
	if (!notes?.trim()) return defaultNotes(title);
	return notes.endsWith("\n") ? notes : `${notes}\n`;
}

/**
 * The files one guest project becomes in a repository, under `projectId`. project.json has the
 * shape the server's create mode writes; sketches and notes are formatted like editor commits.
 * Visibility follows the target repository. Does not include projects-metadata.json.
 */
export function buildSyncedProjectFiles(input: {
	content: GuestProjectContent;
	projectId: string;
	visibility: ProjectVisibility;
	now: string;
}): { files: CommitFile[]; project: WorkspaceProject } {
	const { content, projectId, now } = input;
	const source = content.project;
	const visibility: ProjectVisibility = input.visibility === "public" ? "public" : "private";
	const isPublic = visibility === "public";
	const sketches = guestSketches(source).map((sketch) => ({ ...sketch, file: sketchFilePath(projectId, sketch.id) }));
	const defaultSketch = sketches.find((sketch) => sketch.id === source.defaultSketchId) ?? sketches[0];
	const title = source.title?.trim() || humanizeSlug(projectId);
	const projectJson = {
		schemaVersion: 1,
		id: projectId,
		title,
		description: source.description?.trim() || undefined,
		visibility,
		createdAt: source.createdAt ?? now,
		updatedAt: now,
		projectFile: projectFilePath(projectId),
		defaultSketch: defaultSketch.file,
		sketches,
		docs: { notes: notesFilePath(projectId) },
		sharing: { enabled: isPublic, embed: isPublic },
	};

	const files = [
		jsonFile(projectJson.projectFile, projectJson),
		...sketches.map((sketch) => jsonFile(sketch.file, normalizeScene(content.scenes[sketch.id]))),
		{ path: notesFilePath(projectId), content: notesContent(content.notes, title) },
	];
	const project = projectFromProjectJson({
		projectId,
		projectJson,
		fallbackVisibility: visibility,
		fallbackSketchId: defaultSketch.id,
		now,
	});

	return { files, project };
}

function isUnsafePath(path: string) {
	return !path || path.startsWith("/") || path.includes("..") || path.includes("\\");
}

function formatMegabytes(bytes: number) {
	return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/**
 * Why the commit route would reject these files, or null if it would accept them. Mirrors
 * validateGithubFilePath / validateGithubFileChange (src/server/github-validation.ts) and the
 * non-empty check in createCommitOnBranch (src/server/github.ts).
 */
export function findCommitLimitError(files: readonly CommitFile[]): string | null {
	if (files.length === 0) return "There is nothing to sync in this project.";

	const encoder = new TextEncoder();
	for (const file of files) {
		const name = file.path.split("/").pop() ?? file.path;
		if (isUnsafePath(file.path)) {
			return `"${name}" can't be saved to GitHub because its name is not a valid file path.`;
		}
		const size = encoder.encode(file.content).byteLength;
		if (size > MAX_COMMIT_FILE_BYTES) {
			return `"${name}" is ${formatMegabytes(size)}; GitHub sync accepts files up to ${formatMegabytes(MAX_COMMIT_FILE_BYTES)}. Remove some large images from it, then try again.`;
		}
	}
	return null;
}

/** A repository-safe, unused project id for `title`. */
export function pickProjectId(title: string, takenIds: Iterable<string>) {
	const taken = [...takenIds];
	const candidate = uniqueProjectId(title, taken);
	// slugify keeps dots, so a title like "..." would give a path the commit route rejects.
	if (!candidate.includes("..") && !candidate.startsWith(".")) return candidate;
	return uniqueProjectId(candidate.replace(/\.+/g, "-"), taken);
}

// ---------------------------------------------------------------------------------------------
// Reading guest drafts
// ---------------------------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sceneFromDraft(value: unknown): SketchScene | null {
	if (!isRecord(value) || !isRecord(value.scene) || !Array.isArray(value.scene.elements)) return null;
	return value.scene as SketchScene;
}

function notesFromDraft(value: unknown) {
	if (!isRecord(value) || typeof value.notes !== "string") return null;
	const updatedAt = typeof value.updatedAt === "string" ? Date.parse(value.updatedAt) : 0;
	return { notes: value.notes, updatedAt: Number.isNaN(updatedAt) ? 0 : updatedAt };
}

/** The editor keeps notes beside whichever sketch was open, so the newest copy wins. */
export async function readGuestProjectContent(
	project: WorkspaceProject,
	readDraft: LocalSyncDeps["readDraft"],
): Promise<GuestProjectContent> {
	const sketchIds = guestSketches(project).map((sketch) => sketch.id);
	const keys = sketchIds.map((sketchId) => draftKey(LOCAL_WORKSPACE_ID, project.id, sketchId, null));
	const [sceneDrafts, notesDrafts] = await Promise.all([
		Promise.all(keys.map((key) => readDraft(key))),
		Promise.all(keys.map((key) => readDraft(`${key}:notes`))),
	]);

	const scenes = Object.fromEntries(sketchIds.map((sketchId, index) => [sketchId, sceneFromDraft(sceneDrafts[index])]));
	const newestNotes = notesDrafts
		.map(notesFromDraft)
		.filter((draft) => draft !== null)
		.sort((left, right) => right.updatedAt - left.updatedAt)[0];

	return { project, scenes, notes: newestNotes?.notes ?? null };
}

// ---------------------------------------------------------------------------------------------
// Errors in plain language
// ---------------------------------------------------------------------------------------------

/** True when the GitHub session is gone and signing in again is the fix. */
export function needsSignIn(error: unknown) {
	return (
		error instanceof ApiError &&
		(error.status === 401 || error.code === "github_not_connected" || error.code === "github_token_unavailable")
	);
}

export function describeSyncError(error: unknown): string {
	if (error instanceof ApiError) {
		if (error.status === 401) return "Your GitHub session has expired. Sign in again, then retry.";
		if (needsSignIn(error)) return "Sketchflow can't reach GitHub for your account. Sign in again, then retry.";
		if (error.status === 409) return "The repository changed while syncing. Try again.";
		if (error.status === 429) return "Too many saves in a short time. Wait a minute, then try again.";
		if (error.status === 403) return "GitHub refused the change. Check that you can write to this repository.";
		if (error.status === 404) return "This repository workspace wasn't found. It may have been removed.";
		if (error.status >= 500) return "GitHub isn't responding right now. Try again in a moment.";
		return error.message;
	}
	if (error instanceof TypeError) return "Sketchflow couldn't reach the server. Check your connection, then try again.";
	if (error instanceof Error && error.message) return error.message;
	return "Sync failed.";
}

// ---------------------------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------------------------

export const defaultLocalSyncDeps: LocalSyncDeps = {
	// no-store: the projects route allows a 30 second browser cache, and this needs the live head.
	fetchRepoProjects: (workspaceId) =>
		apiJson<WorkspaceProjectsResponse>(`/api/workspaces/${encodeURIComponent(workspaceId)}/projects`, { cache: "no-store" }),
	commitFiles: commitWorkspaceFiles,
	listGuestProjects,
	readDraft: async (key) => (await getDraft<unknown>(key))?.value ?? null,
	removeGuestProject: async (projectId) => {
		await deleteLocalProject(LOCAL_WORKSPACE_ID, projectId, null);
		await purgeProjectDrafts(LOCAL_WORKSPACE_ID, projectId, null);
	},
	now: () => new Date().toISOString(),
};

type RepoState = { projects: WorkspaceProject[]; headSha: string | null };

type SyncOneOutcome =
	| { ok: true; result: SyncResult; project: WorkspaceProject; headSha: string }
	| { ok: false; result: SyncResult; error: unknown };

async function loadRepoState(deps: LocalSyncDeps, workspaceId: string): Promise<RepoState> {
	const snapshot = await deps.fetchRepoProjects(workspaceId);
	return { projects: snapshot.projects ?? [], headSha: snapshot.workspace?.latestCommitSha ?? null };
}

function failed(project: Pick<WorkspaceProject, "id" | "title">, error: unknown): SyncResult {
	return {
		projectId: project.id,
		title: project.title,
		status: "failed",
		error: describeSyncError(error),
		...(needsSignIn(error) ? { needsSignIn: true } : null),
	};
}

function metadataFile(workspace: SyncTarget, projects: WorkspaceProject[], now: string): CommitFile {
	const metadata = buildProjectsMetadata({
		projects,
		workspace: { owner: workspace.repoOwner, repo: workspace.repoName, defaultBranch: workspace.defaultBranch },
		now,
	});
	return jsonFile(PROJECTS_METADATA_PATH, metadata);
}

async function syncOneProject(input: {
	project: WorkspaceProject;
	workspace: SyncTarget;
	repo: RepoState;
	synced: readonly WorkspaceProject[];
	deps: LocalSyncDeps;
}): Promise<SyncOneOutcome> {
	const { project, workspace, repo, synced, deps } = input;
	try {
		const newProjectId = pickProjectId(project.title, [...repo.projects, ...synced].map((item) => item.id));
		const content = await readGuestProjectContent(project, deps.readDraft);
		const now = deps.now();
		const built = buildSyncedProjectFiles({ content, projectId: newProjectId, visibility: workspace.visibility, now });
		const files = [...built.files, metadataFile(workspace, [built.project, ...synced, ...repo.projects], now)];
		const limitError = findCommitLimitError(files);
		if (limitError) {
			const result: SyncResult = { projectId: project.id, title: project.title, status: "failed", error: limitError };
			return { ok: false, result, error: new Error(limitError) };
		}

		const response = await deps.commitFiles({
			workspaceId: workspace.id,
			message: `Add "${built.project.title}" from this device`,
			files,
			expectedHeadSha: repo.headSha,
		});
		const warning = await removeAfterSync(project.id, deps);
		const result: SyncResult = { projectId: project.id, title: project.title, status: "synced", newProjectId, ...(warning ? { warning } : null) };
		return { ok: true, result, project: built.project, headSha: response.commit.sha };
	} catch (error) {
		return { ok: false, result: failed(project, error), error };
	}
}

async function removeAfterSync(projectId: string, deps: LocalSyncDeps) {
	try {
		await deps.removeGuestProject(projectId);
		return null;
	} catch {
		return "Saved to the repository, but the copy on this device could not be removed. You can delete it yourself.";
	}
}

function isConflict(error: unknown) {
	return error instanceof ApiError && error.status === 409 && !needsSignIn(error);
}

/**
 * Copies the chosen guest projects into `workspace`, one commit per project, in the order given.
 * Ids are renamed when they collide with the repository or with an earlier project in this run.
 * A project is removed from this device only after its commit succeeded. Throws only when the
 * repository's project list cannot be read at all, before anything has been written.
 */
export async function syncGuestProjects(
	input: SyncGuestProjectsInput,
	deps: LocalSyncDeps = defaultLocalSyncDeps,
): Promise<SyncResult[]> {
	const { workspace, projectIds, onProgress } = input;
	const total = projectIds.length;
	const guests = await deps.listGuestProjects();
	let repo = await loadRepoState(deps, workspace.id);
	// Every commit names the branch head it was built on, so a change made elsewhere in the
	// meantime is rejected instead of being overwritten. Without a head there is no such guard.
	if (!repo.headSha) {
		throw new Error("Couldn't read the repository's latest commit, so nothing was synced. Try again in a moment.");
	}
	let synced: WorkspaceProject[] = [];
	let results: SyncResult[] = [];
	let stopError: unknown = null;

	for (const [index, projectId] of projectIds.entries()) {
		const project = guests.find((guest) => guest.id === projectId);
		onProgress?.({ completed: index, total, currentTitle: project?.title ?? null });

		if (!project) {
			results = [...results, { projectId, title: projectId, status: "failed", error: "This project is no longer on this device." }];
			continue;
		}
		if (stopError) {
			results = [...results, failed(project, stopError)];
			continue;
		}

		const outcome = await syncOneProject({ project, workspace, repo, synced, deps });
		results = [...results, outcome.result];
		if (outcome.ok) {
			repo = { ...repo, headSha: outcome.headSha };
			synced = [...synced, outcome.project];
		} else if (needsSignIn(outcome.error)) {
			// Every later request would fail the same way; keep the rest on this device untouched.
			stopError = outcome.error;
		} else if (isConflict(outcome.error)) {
			repo = await loadRepoState(deps, workspace.id).catch(() => repo);
		}
	}

	onProgress?.({ completed: total, total, currentTitle: null });
	return results;
}
