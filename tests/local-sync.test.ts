import { expect, test } from "bun:test";

import { ApiError } from "../src/lib/api";
import {
	MAX_COMMIT_FILE_BYTES,
	buildSyncedProjectFiles,
	describeSyncError,
	findCommitLimitError,
	pickProjectId,
	syncGuestProjects,
	type CommitFile,
	type LocalSyncDeps,
	type SyncProgress,
	type SyncTarget,
} from "../src/lib/local-sync";
import { buildLocalProject } from "../src/lib/local-workspace";
import { PROJECTS_METADATA_PATH, type ProjectsMetadata, type WorkspaceProject } from "../src/lib/project-metadata";
import { draftKey } from "../src/lib/storage-keys";

const NOW = "2026-11-12T10:00:00.000Z";
const CREATED = "2026-11-01T09:00:00.000Z";

const repoWorkspace: SyncTarget = {
	id: "ws-1",
	repoOwner: "octo",
	repoName: "notes",
	defaultBranch: "main",
	visibility: "private",
};

function guestProject(title: string, id = title.toLowerCase().replace(/\s+/g, "-")): WorkspaceProject {
	return buildLocalProject({ projectId: id, title, visibility: "private", now: CREATED });
}

function sceneKey(projectId: string, sketchId = "system-map") {
	return draftKey("local", projectId, sketchId, null);
}

type CommitCall = { workspaceId: string; message: string; files: CommitFile[]; expectedHeadSha?: string | null };

function fakeDeps(options: {
	guests: WorkspaceProject[];
	repoProjectIds?: string[];
	drafts?: Record<string, unknown>;
	failCommitFor?: (call: CommitCall) => unknown;
}) {
	const commits: CommitCall[] = [];
	const removed: string[] = [];
	let fetches = 0;
	let guests = options.guests;
	const repoProjects = (options.repoProjectIds ?? []).map((id) => ({ ...guestProject(id, id), isLocalOnly: undefined }));
	const deps: LocalSyncDeps = {
		fetchRepoProjects: async () => {
			fetches += 1;
			return { projects: repoProjects, workspace: { latestCommitSha: "a".repeat(40) } };
		},
		commitFiles: async (call) => {
			commits.push(call);
			const failure = options.failCommitFor?.(call);
			if (failure) throw failure;
			return { commit: { sha: String(commits.length).repeat(40), htmlUrl: "", branch: "main", files: [] } };
		},
		listGuestProjects: async () => guests,
		readDraft: async (key) => options.drafts?.[key] ?? null,
		removeGuestProject: async (projectId) => {
			removed.push(projectId);
			guests = guests.filter((guest) => guest.id !== projectId);
		},
		now: () => NOW,
	};
	return { deps, commits, removed, fetchCount: () => fetches, currentGuests: () => guests };
}

function parseFile(files: CommitFile[], path: string) {
	const file = files.find((item) => item.path === path);
	if (!file) throw new Error(`missing ${path}`);
	return JSON.parse(file.content) as Record<string, unknown>;
}

// --- building files ---------------------------------------------------------------------------

test("builds project.json, every sketch and the notes under the new project id", () => {
	// Arrange
	const project = {
		...guestProject("Roadmap", "roadmap"),
		description: "Q4 plan",
		sketches: [
			{ id: "system-map", title: "System Map", file: "projects/roadmap/sketches/system-map.excalidraw.json" },
			{ id: "flows", title: "Flows", file: "projects/roadmap/sketches/flows.excalidraw.json" },
		],
	};
	const scene = { elements: [{ id: "el-1" }], appState: { viewBackgroundColor: "#fff" } };

	// Act
	const { files, project: metadata } = buildSyncedProjectFiles({
		content: { project, scenes: { "system-map": scene, flows: null }, notes: "# Roadmap\n\nShip it" },
		projectId: "roadmap-2",
		visibility: "private",
		now: NOW,
	});

	// Assert
	expect(files.map((file) => file.path)).toEqual([
		"projects/roadmap-2/project.json",
		"projects/roadmap-2/sketches/system-map.excalidraw.json",
		"projects/roadmap-2/sketches/flows.excalidraw.json",
		"projects/roadmap-2/docs/notes.md",
	]);
	expect(parseFile(files, "projects/roadmap-2/project.json")).toEqual({
		schemaVersion: 1,
		id: "roadmap-2",
		title: "Roadmap",
		description: "Q4 plan",
		visibility: "private",
		createdAt: CREATED,
		updatedAt: NOW,
		projectFile: "projects/roadmap-2/project.json",
		defaultSketch: "projects/roadmap-2/sketches/system-map.excalidraw.json",
		sketches: [
			{ id: "system-map", title: "System Map", file: "projects/roadmap-2/sketches/system-map.excalidraw.json" },
			{ id: "flows", title: "Flows", file: "projects/roadmap-2/sketches/flows.excalidraw.json" },
		],
		docs: { notes: "projects/roadmap-2/docs/notes.md" },
		sharing: { enabled: false, embed: false },
	});
	const sketch = files[1];
	expect(sketch.content.endsWith("}\n")).toBe(true);
	expect(JSON.parse(sketch.content)).toMatchObject({ type: "excalidraw", version: 2, elements: [{ id: "el-1" }], files: {} });
	expect(JSON.parse(files[2].content).elements).toEqual([]);
	expect(files[3].content).toBe("# Roadmap\n\nShip it\n");
	expect(metadata).toMatchObject({ id: "roadmap-2", title: "Roadmap", visibility: "private", defaultSketchId: "system-map" });
	expect(metadata.isLocalOnly).toBeUndefined();
});

test("a public repository makes the project public with sharing enabled", () => {
	// Arrange
	const project = guestProject("Public Map", "public-map");

	// Act
	const { files } = buildSyncedProjectFiles({
		content: { project, scenes: {}, notes: null },
		projectId: "public-map",
		visibility: "public",
		now: NOW,
	});

	// Assert
	const projectJson = parseFile(files, "projects/public-map/project.json");
	expect(projectJson.visibility).toBe("public");
	expect(projectJson.sharing).toEqual({ enabled: true, embed: true });
});

test("missing notes fall back to the default notes for the title", () => {
	// Arrange
	const project = guestProject("Empty", "empty");

	// Act
	const { files } = buildSyncedProjectFiles({ content: { project, scenes: {}, notes: "  " }, projectId: "empty", visibility: "private", now: NOW });

	// Assert
	expect(files.find((file) => file.path.endsWith("notes.md"))?.content).toBe("# Empty\n\nProject documentation and notes.\n");
});

// --- limits and ids ---------------------------------------------------------------------------

test("flags a file over the commit route's size limit and unsafe paths", () => {
	// Arrange
	const big = { path: "projects/a/sketches/big.excalidraw.json", content: "x".repeat(MAX_COMMIT_FILE_BYTES + 1) };
	const ok = { path: "projects/a/project.json", content: "{}" };

	// Act / Assert
	expect(findCommitLimitError([ok])).toBeNull();
	expect(findCommitLimitError([ok, big])).toContain("big.excalidraw.json");
	expect(findCommitLimitError([{ path: "projects/../x", content: "" }])).toContain("not a valid file path");
	expect(findCommitLimitError([])).not.toBeNull();
});

test("picks ids that avoid existing ones and never produce a dotted path", () => {
	expect(pickProjectId("Roadmap", ["roadmap", "roadmap-2"])).toBe("roadmap-3");
	expect(pickProjectId("...", [])).toBe("untitled");
});

test("describes API errors in plain language", () => {
	expect(describeSyncError(new ApiError("Unauthorized", 401))).toContain("session has expired");
	expect(describeSyncError(new ApiError("x", 409, "github_conflict"))).toContain("repository changed");
	expect(describeSyncError(new ApiError("File is too large", 400))).toBe("File is too large");
});

// --- orchestration ----------------------------------------------------------------------------

test("renames projects that collide with the repository and with each other in one run", async () => {
	// Arrange
	const first = guestProject("Roadmap", "roadmap");
	const second = guestProject("Roadmap", "roadmap-2");
	const { deps, commits } = fakeDeps({ guests: [first, second], repoProjectIds: ["roadmap"] });

	// Act
	const results = await syncGuestProjects({ workspace: repoWorkspace, projectIds: ["roadmap", "roadmap-2"] }, deps);

	// Assert
	expect(results.map((result) => result.newProjectId)).toEqual(["roadmap-2", "roadmap-3"]);
	expect(commits[0].files[0].path).toBe("projects/roadmap-2/project.json");
	expect(commits[1].files[0].path).toBe("projects/roadmap-3/project.json");
	expect(commits[0].message).toBe('Add "Roadmap" from this device');
});

test("commits one project per commit with the guest drafts and chains the expected head", async () => {
	// Arrange
	const project = guestProject("Map", "map");
	const drafts = {
		[sceneKey("map")]: { scene: { elements: [{ id: "drawn" }] }, updatedAt: NOW },
		[`${sceneKey("map")}:notes`]: { notes: "# Map notes", updatedAt: NOW },
	};
	const other = guestProject("Other", "other");
	const { deps, commits } = fakeDeps({ guests: [project, other], drafts });

	// Act
	await syncGuestProjects({ workspace: repoWorkspace, projectIds: ["map", "other"] }, deps);

	// Assert
	expect(commits).toHaveLength(2);
	expect(JSON.parse(commits[0].files[1].content).elements).toEqual([{ id: "drawn" }]);
	expect(commits[0].files[2].content).toBe("# Map notes\n");
	expect(commits[0].expectedHeadSha).toBe("a".repeat(40));
	expect(commits[1].expectedHeadSha).toBe("1".repeat(40));
});

test("a failed commit keeps that project on the device while the others sync and are removed", async () => {
	// Arrange
	const guests = [guestProject("One", "one"), guestProject("Two", "two"), guestProject("Three", "three")];
	const { deps, removed, currentGuests } = fakeDeps({
		guests,
		failCommitFor: (call) => (call.message.includes('"Two"') ? new ApiError("GitHub is down", 502) : null),
	});

	// Act
	const results = await syncGuestProjects({ workspace: repoWorkspace, projectIds: ["one", "two", "three"] }, deps);

	// Assert
	expect(results.map((result) => result.status)).toEqual(["synced", "failed", "synced"]);
	expect(results[1].error).toContain("isn't responding");
	expect(removed).toEqual(["one", "three"]);
	expect(currentGuests().map((guest) => guest.id)).toEqual(["two"]);
});

test("an oversize project is reported as failed without calling commit", async () => {
	// Arrange
	const project = guestProject("Huge", "huge");
	const drafts = { [sceneKey("huge")]: { scene: { elements: [{ blob: "x".repeat(MAX_COMMIT_FILE_BYTES) }] } } };
	const { deps, commits, removed } = fakeDeps({ guests: [project], drafts });

	// Act
	const [result] = await syncGuestProjects({ workspace: repoWorkspace, projectIds: ["huge"] }, deps);

	// Assert
	expect(result.status).toBe("failed");
	expect(result.error).toContain("system-map.excalidraw.json");
	expect(commits).toHaveLength(0);
	expect(removed).toHaveLength(0);
});

test("every commit carries metadata with the repo's projects and those synced so far, never failed ones", async () => {
	// Arrange
	const guests = [guestProject("Alpha", "alpha"), guestProject("Beta", "beta"), guestProject("Gamma", "gamma")];
	const { deps, commits } = fakeDeps({
		guests,
		repoProjectIds: ["existing"],
		failCommitFor: (call) => (call.message.includes('"Beta"') ? new ApiError("Bad request", 400) : null),
	});

	// Act
	await syncGuestProjects({ workspace: repoWorkspace, projectIds: ["alpha", "beta", "gamma"] }, deps);

	// Assert
	const metadataIds = commits.map((commit) => {
		const metadata = parseFile(commit.files, PROJECTS_METADATA_PATH) as unknown as ProjectsMetadata;
		return metadata.projects.map((project) => project.id);
	});
	expect(metadataIds).toEqual([
		["alpha", "existing"],
		["alpha", "beta", "existing"],
		["alpha", "existing", "gamma"],
	]);
	const last = parseFile(commits[2].files, PROJECTS_METADATA_PATH) as unknown as ProjectsMetadata;
	expect(last.workspace).toEqual({ owner: "octo", repo: "notes", defaultBranch: "main" });
});

test("an expired session stops the run and keeps every remaining project on the device", async () => {
	// Arrange
	const guests = [guestProject("One", "one"), guestProject("Two", "two")];
	const { deps, commits, removed } = fakeDeps({ guests, failCommitFor: () => new ApiError("Unauthorized", 401) });

	// Act
	const results = await syncGuestProjects({ workspace: repoWorkspace, projectIds: ["one", "two"] }, deps);

	// Assert
	expect(commits).toHaveLength(1);
	expect(results.every((result) => result.status === "failed" && result.needsSignIn)).toBe(true);
	expect(removed).toHaveLength(0);
});

test("a conflict refreshes the repository state before the next project", async () => {
	// Arrange
	const guests = [guestProject("One", "one"), guestProject("Two", "two")];
	const { deps, fetchCount } = fakeDeps({
		guests,
		failCommitFor: (call) => (call.message.includes('"One"') ? new ApiError("changed", 409, "github_conflict") : null),
	});

	// Act
	const results = await syncGuestProjects({ workspace: repoWorkspace, projectIds: ["one", "two"] }, deps);

	// Assert
	expect(results.map((result) => result.status)).toEqual(["failed", "synced"]);
	expect(fetchCount()).toBe(2);
});

test("reports progress and fails unknown project ids without touching anything", async () => {
	// Arrange
	const { deps, commits } = fakeDeps({ guests: [guestProject("One", "one")] });
	const progress: SyncProgress[] = [];

	// Act
	const results = await syncGuestProjects(
		{ workspace: repoWorkspace, projectIds: ["gone", "one"], onProgress: (update) => progress.push(update) },
		deps,
	);

	// Assert
	expect(results[0]).toMatchObject({ projectId: "gone", status: "failed" });
	expect(commits).toHaveLength(1);
	expect(progress.map((update) => update.completed)).toEqual([0, 1, 2]);
	expect(progress.at(-1)).toEqual({ completed: 2, total: 2, currentTitle: null });
});

test("a project whose device copy cannot be removed after its commit is still synced, with a warning", async () => {
	// Arrange
	const { deps } = fakeDeps({ guests: [guestProject("One", "one")] });
	const failingDeps: LocalSyncDeps = { ...deps, removeGuestProject: async () => Promise.reject(new Error("idb")) };

	// Act
	const [result] = await syncGuestProjects({ workspace: repoWorkspace, projectIds: ["one"] }, failingDeps);

	// Assert
	expect(result.status).toBe("synced");
	expect(result.warning).toContain("could not be removed");
});
