import { beforeEach, expect, test } from "bun:test";

import { githubAcceptingCommits, installMocks, json, post, resetState, state } from "./helpers";

installMocks();
const { POST } = await import("../../src/app/api/workspaces/bootstrap/route");

const HEAD = "a".repeat(40);
const repo = { name: "notes", full_name: "octo/notes", private: false, description: null, homepage: null, html_url: "https://github.com/octo/notes", default_branch: "main", owner: { login: "octo" } };
const githubUser = { login: "octo", id: 7, avatar_url: null, html_url: "https://github.com/octo" };

function github(options: { exists: boolean; tree?: { path: string; type: "blob" | "tree" }[]; treeStatus?: number }) {
	const accept = githubAcceptingCommits(HEAD);
	return (method: string, path: string) => {
		if (method === "GET" && path === "/user") return json(githubUser);
		if (method === "GET" && path === "/repos/octo/notes") return options.exists ? json(repo) : json({ message: "Not Found" }, 404);
		if (method === "POST" && path === "/user/repos") return json(repo, 201);
		if (method === "GET" && path.startsWith(`/repos/octo/notes/git/trees/${HEAD}`)) {
			return options.treeStatus
				? json({ message: "Server Error" }, options.treeStatus)
				: json({ sha: HEAD, url: "", truncated: false, tree: (options.tree ?? []).map((entry) => ({ ...entry, mode: "100644", sha: "s", url: "" })) });
		}
		return accept(method, path);
	};
}

const committedPaths = () =>
	(state.github.find((call) => call.method === "POST" && call.path.endsWith("/git/trees"))?.body as { tree: { path: string }[] } | undefined)?.tree.map(
		(entry) => entry.path,
	) ?? null;
const wrote = () => state.github.some((call) => call.method === "PATCH" || call.path.endsWith("/git/trees"));

beforeEach(resetState);

test("a new repository is created and fully scaffolded", async () => {
	state.githubHandler = github({ exists: false });
	const response = await POST(post("/api/workspaces/bootstrap", { repoName: "notes" }));
	const body = await response.json();

	expect(response.status).toBe(201);
	expect(body.repository.created).toBe(true);
	expect(committedPaths()).toContain("README.md");
	expect(committedPaths()).toContain(".sketchflow/workspace.json");
	expect(state.events.map((event) => event.eventType)).toEqual(["workspace_repo_created"]);
});

test("an existing repository keeps its README and its own files", async () => {
	state.githubHandler = github({
		exists: true,
		tree: [
			{ path: "README.md", type: "blob" },
			{ path: "projects/first-project/docs/notes.md", type: "blob" },
		],
	});
	const response = await POST(post("/api/workspaces/bootstrap", { repoName: "notes" }));

	expect(response.status).toBe(201);
	const paths = committedPaths();
	expect(paths).not.toContain("README.md");
	expect(paths).not.toContain("projects/first-project/docs/notes.md");
	expect(paths).toContain(".sketchflow/workspace.json");
	expect(state.github.some((call) => call.method === "PATCH" && call.path === "/repos/octo/notes")).toBe(false);
});

test("an already initialised workspace is connected without any commit", async () => {
	state.githubHandler = github({ exists: true, tree: [{ path: ".sketchflow/workspace.json", type: "blob" }] });
	const response = await POST(post("/api/workspaces/bootstrap", { repoName: "notes" }));
	const body = await response.json();

	expect(response.status).toBe(201);
	expect(wrote()).toBe(false);
	expect(body.commit.sha).toBe(HEAD);
	expect(body.commit.files).toEqual([]);
	expect(state.events.map((event) => event.eventType)).toEqual(["workspace_repo_connected"]);
});

test("nothing is written when the existing repository cannot be inspected", async () => {
	state.githubHandler = github({ exists: true, treeStatus: 500 });
	const response = await POST(post("/api/workspaces/bootstrap", { repoName: "notes" }));

	expect(response.status).toBeGreaterThanOrEqual(400);
	expect(wrote()).toBe(false);
	expect(state.upserts).toHaveLength(0);
});

test("invalid repository names are rejected", async () => {
	state.githubHandler = github({ exists: false });
	const response = await POST(post("/api/workspaces/bootstrap", { repoName: "bad/name" }));
	expect(response.status).toBe(400);
	expect(state.github.some((call) => call.method === "POST")).toBe(false);
});

test("rapid repeated bootstraps are rate limited", async () => {
	state.githubHandler = github({ exists: true, tree: [{ path: ".sketchflow/workspace.json", type: "blob" }] });
	state.userId = "user-in-a-hurry";
	const statuses: number[] = [];
	for (let attempt = 0; attempt < 7; attempt += 1) {
		statuses.push((await POST(post("/api/workspaces/bootstrap", { repoName: "notes" }))).status);
	}
	expect(statuses.filter((status) => status === 201)).toHaveLength(5);
	expect(statuses.at(-1)).toBe(429);
});
