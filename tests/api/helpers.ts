import { mock } from "bun:test";

/**
 * Shared fakes for API handler tests. Handlers run for real; only the edges are replaced:
 * the auth provider, the database repositories, and outbound fetch to GitHub.
 */

export const OWNER_ID = "user-owner";

export const workspace = {
	id: "ws-1",
	stackUserId: OWNER_ID,
	repoOwner: "octo",
	repoName: "sketchflow-workspace",
	defaultBranch: "main",
	visibility: "public" as const,
	latestCommitSha: null,
	createdAt: "2026-01-01T00:00:00Z",
	updatedAt: "2026-01-01T00:00:00Z",
};

export const state = {
	userId: OWNER_ID as string | null,
	workspaces: [workspace],
	events: [] as { eventType: string; commitSha?: string | null }[],
	upserts: [] as Record<string, unknown>[],
	github: [] as { method: string; path: string; body: unknown }[],
	githubHandler: (async () => new Response("{}", { status: 404 })) as (method: string, path: string, body: unknown) => Promise<Response> | Response,
};

export function resetState() {
	state.userId = OWNER_ID;
	state.workspaces = [workspace];
	state.events = [];
	state.upserts = [];
	state.github = [];
	state.githubHandler = async () => json({ message: "Not Found" }, 404);
}

export function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export function installMocks() {
	mock.module("server-only", () => ({}));

	mock.module("@/stack/server", () => ({
		stackServerApp: {
			getUser: async () =>
				state.userId
					? {
							id: state.userId,
							primaryEmail: "owner@example.com",
							displayName: "Owner",
							profileImageUrl: null,
							getConnectedAccount: async () => ({
								getAccessToken: async () => ({ status: "ok", data: { accessToken: "test-token" } }),
							}),
						}
					: null,
		},
	}));

	mock.module("@/server/db/repositories", () => ({
		upsertUser: async () => {},
		upsertGithubConnection: async () => {},
		listWorkspaces: async (userId: string) => state.workspaces.filter((item) => item.stackUserId === userId),
		getWorkspace: async (userId: string, id: string) =>
			state.workspaces.find((item) => item.id === id && item.stackUserId === userId) ?? null,
		getWorkspacePublic: async (id: string) => state.workspaces.find((item) => item.id === id) ?? null,
		upsertWorkspace: async (userId: string, input: Record<string, unknown>) => {
			state.upserts.push({ userId, ...input });
			return { ...workspace, ...input, stackUserId: userId };
		},
		updateWorkspaceCommit: async () => {},
		recordSyncEvent: async (event: { eventType: string; commitSha?: string | null }) => {
			state.events.push(event);
		},
	}));

	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
		if (url.hostname !== "api.github.com") {
			throw new Error(`Unexpected outbound request to ${url.hostname}`);
		}
		const method = init?.method ?? "GET";
		const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
		state.github.push({ method, path: url.pathname, body });
		return state.githubHandler(method, url.pathname + url.search, body);
	}) as typeof fetch;
}

export function post(path: string, body: unknown, headers: Record<string, string> = {}) {
	return new Request(`https://sketchflow.space${path}`, {
		method: "POST",
		headers: { "content-type": "application/json", origin: "https://sketchflow.space", host: "sketchflow.space", ...headers },
		body: JSON.stringify(body),
	});
}

/** A GitHub that accepts a commit on `main` at the given head. */
export function githubAcceptingCommits(headSha = "a".repeat(40)) {
	return (method: string, path: string) => {
		if (method === "GET" && path.endsWith("/git/ref/heads/main")) return json({ object: { sha: headSha, type: "commit" } });
		if (method === "GET" && path.includes("/git/commits/")) return json({ sha: headSha, tree: { sha: "tree-old" }, html_url: "" });
		if (method === "POST" && path.endsWith("/git/trees")) return json({ sha: "tree-new" });
		if (method === "POST" && path.endsWith("/git/commits")) return json({ sha: "b".repeat(40), tree: { sha: "tree-new" }, html_url: "https://github.com/octo/x/commit/b" });
		if (method === "PATCH" && path.endsWith("/git/refs/heads/main")) return json({ object: { sha: "b".repeat(40), type: "commit" } });
		return json({ message: "Not Found" }, 404);
	};
}
