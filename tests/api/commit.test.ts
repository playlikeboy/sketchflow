import { beforeEach, expect, test } from "bun:test";

import { githubAcceptingCommits, installMocks, json, post, resetState, state } from "./helpers";

installMocks();
const { POST } = await import("../../src/app/api/workspaces/[workspaceId]/commit/route");

const params = (workspaceId = "ws-1") => ({ params: Promise.resolve({ workspaceId }) });
const files = [{ path: "projects/demo/docs/notes.md", content: "# Demo\n" }];

type ResponseBody = {
	code?: string;
	commit: { sha: string; files: string[] };
	repository: { created: boolean };
};

beforeEach(resetState);

test("commits files and records a sync event", async () => {
	state.githubHandler = githubAcceptingCommits();
	const response = await POST(post("/api/workspaces/ws-1/commit", { files, message: "Update notes" }), params());
	const body = (await response.json()) as ResponseBody;

	expect(response.status).toBe(200);
	expect(body.commit.sha).toBe("b".repeat(40));
	expect(state.events.map((event) => event.eventType)).toEqual(["workspace_commit"]);
	const tree = state.github.find((call) => call.method === "POST" && call.path.endsWith("/git/trees"));
	expect((tree?.body as { tree: { path: string }[] }).tree.map((entry) => entry.path)).toEqual(["projects/demo/docs/notes.md"]);
});

test("requires a signed-in user", async () => {
	state.userId = null;
	const response = await POST(post("/api/workspaces/ws-1/commit", { files }), params());
	expect(response.status).toBe(401);
	expect(state.github).toHaveLength(0);
});

test("does not reveal or write to another user's workspace", async () => {
	state.userId = "someone-else";
	const response = await POST(post("/api/workspaces/ws-1/commit", { files }), params());
	expect(response.status).toBe(404);
	expect(state.github).toHaveLength(0);
});

test("rejects cross-site requests before doing any work", async () => {
	const response = await POST(post("/api/workspaces/ws-1/commit", { files }, { origin: "https://evil.example" }), params());
	expect(response.status).toBe(403);
	expect(state.github).toHaveLength(0);
});

test("rejects paths that escape the repository", async () => {
	for (const path of ["../outside.txt", "/etc/passwd", "a\\b"]) {
		const response = await POST(post("/api/workspaces/ws-1/commit", { files: [{ path, content: "x" }] }), params());
		expect(response.status).toBe(400);
	}
	expect(state.github).toHaveLength(0);
});

test("rejects a malformed expected head", async () => {
	const response = await POST(post("/api/workspaces/ws-1/commit", { files, expectedHeadSha: "not-a-sha" }), params());
	expect(response.status).toBe(400);
});

test("reports a conflict instead of overwriting when the branch has moved", async () => {
	state.githubHandler = githubAcceptingCommits("c".repeat(40));
	const response = await POST(post("/api/workspaces/ws-1/commit", { files, expectedHeadSha: "a".repeat(40) }), params());
	const body = (await response.json()) as ResponseBody;

	expect(response.status).toBe(409);
	expect(body.code).toBe("github_conflict");
	expect(state.github.some((call) => call.method !== "GET")).toBe(false);
	expect(state.events).toHaveLength(0);
});

test("reports a conflict when the branch moves during the commit", async () => {
	const accept = githubAcceptingCommits();
	state.githubHandler = (method, path) =>
		method === "PATCH" ? json({ message: "Update is not a fast forward" }, 422) : accept(method, path);
	const response = await POST(post("/api/workspaces/ws-1/commit", { files }), params());
	expect(response.status).toBe(409);
	expect(((await response.json()) as ResponseBody).code).toBe("github_conflict");
});
