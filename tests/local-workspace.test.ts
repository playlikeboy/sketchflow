import { expect, test } from "bun:test";

import {
	LOCAL_WORKSPACE,
	buildLocalProject,
	isLocalWorkspace,
	storageUserId,
	uniqueProjectId,
	workspaceLabel,
} from "../src/lib/local-workspace";

test("recognises only the guest workspace as local", () => {
	expect(isLocalWorkspace("local")).toBe(true);
	expect(isLocalWorkspace("ws-1")).toBe(false);
	expect(isLocalWorkspace(null)).toBe(false);
});

test("labels the guest workspace as this device and repositories by owner/name", () => {
	expect(workspaceLabel(LOCAL_WORKSPACE)).toBe("This device");
	expect(workspaceLabel({ id: "ws-1", repoOwner: "octo", repoName: "notes" })).toBe("octo/notes");
});

test("stores guest data under the local scope even when someone is signed in", () => {
	expect(storageUserId("local", "github_42")).toBeNull();
	expect(storageUserId("ws-1", "github_42")).toBe("github_42");
	expect(storageUserId("ws-1", undefined)).toBeNull();
});

test("picks a project id that does not collide with existing ones", () => {
	expect(uniqueProjectId("System Map", [])).toBe("system-map");
	expect(uniqueProjectId("System Map", ["system-map"])).toBe("system-map-2");
	expect(uniqueProjectId("System Map", ["system-map", "system-map-2"])).toBe("system-map-3");
});

test("builds a local-only project with repository file paths ready for a later sync", () => {
	const project = buildLocalProject({ projectId: "demo", title: "Demo", visibility: "private", now: "2026-01-01T00:00:00.000Z" });

	expect(project.isLocalOnly).toBe(true);
	expect(project.defaultSketch).toBe("projects/demo/sketches/system-map.excalidraw.json");
	expect(project.notesFile).toBe("projects/demo/docs/notes.md");
	expect(project.projectFile).toBe("projects/demo/project.json");
	expect(project.sharing).toEqual({ enabled: false, embed: false });
});
