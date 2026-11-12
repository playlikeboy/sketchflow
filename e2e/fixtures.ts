import type { Page, Route } from "@playwright/test";

/** Canned API responses for a signed-in user with one public workspace and a few projects. */

export const user = { id: "user-demo", primaryEmail: "demo@example.com", displayName: "Demo User", profileImageUrl: null };

export const workspace = {
	id: "ws-1",
	stackUserId: user.id,
	repoOwner: "demo-user",
	repoName: "sketchflow-workspace",
	defaultBranch: "main",
	visibility: "public",
	latestCommitSha: "7f2a1b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a",
	createdAt: "2026-09-01T10:00:00Z",
	updatedAt: "2026-11-10T10:00:00Z",
};

function project(id: string, title: string, description: string | undefined, updatedAt: string, extra: Record<string, unknown> = {}) {
	return {
		id,
		title,
		description,
		visibility: "public",
		createdAt: "2026-09-02T10:00:00Z",
		updatedAt,
		projectFile: `projects/${id}/project.json`,
		defaultSketch: `projects/${id}/sketches/system-map.excalidraw.json`,
		defaultSketchId: "system-map",
		notesFile: `projects/${id}/docs/notes.md`,
		sketches: [{ id: "system-map", title: "System Map", file: `projects/${id}/sketches/system-map.excalidraw.json` }],
		sharing: { enabled: true, embed: true },
		...extra,
	};
}

export const projects = [
	project("payments-architecture", "Payments architecture", "Services, queues and the ledger", "2026-11-10T09:12:00Z"),
	project("photosynthesis-lesson", "Photosynthesis lesson board", "Year 9 biology", "2026-11-08T14:30:00Z"),
	project("onboarding-flow", "Onboarding flow", undefined, "2026-11-02T08:00:00Z", {
		visibility: "private",
		sharing: { enabled: false, embed: false },
	}),
];

export const commits = [
	["7f2a1b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a", "Add cache in front of the database", "2026-11-10T09:12:00Z"],
	["3c8d4e2c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a", "Add queue between API and worker", "2026-11-08T17:40:00Z"],
	["b5e1a04c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a", "First system map", "2026-11-05T11:02:00Z"],
].map(([sha, message, authorDate]) => ({
	sha,
	message,
	authorName: "Demo User",
	authorDate,
	htmlUrl: `https://github.com/demo-user/sketchflow-workspace/commit/${sha}`,
}));

const scene = { type: "excalidraw", version: 2, source: "https://sketchflow.space", elements: [], appState: { viewBackgroundColor: "#ffffff" }, files: {} };

export type MockOptions = {
	signedIn?: boolean;
	noWorkspaces?: boolean;
	/** Answer a save with a conflict while it names the head it expects, as GitHub does when the branch moved. */
	commitConflict?: boolean;
};

export type ApiLog = { method: string; path: string; body: unknown }[];

export async function mockApi(page: Page, options: MockOptions = {}): Promise<ApiLog> {
	const log: ApiLog = [];
	const signedIn = options.signedIn ?? true;

	await page.route("**/api/**", async (route: Route) => {
		const request = route.request();
		const path = new URL(request.url()).pathname;
		// Stack Auth's own SDK calls are not ours to answer.
		if (path.startsWith("/api/v1/")) return route.abort();

		const method = request.method();
		log.push({ method, path, body: request.postDataJSON?.() ?? null });
		const json = (body: unknown, status = 200) =>
			route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

		if (path === "/api/auth/me") return json(signedIn ? { authenticated: true, user } : { authenticated: false, user: null });
		if (!signedIn) return json({ error: "Authentication required" }, 401);
		if (path === "/api/github/status") {
			return json({ connected: true, scopes: ["repo"], github: { login: "demo-user", id: 1, avatarUrl: null, htmlUrl: "https://github.com/demo-user" }, source: "stack-auth" });
		}
		if (path === "/api/workspaces") return json({ workspaces: options.noWorkspaces ? [] : [workspace] });
		if (path.endsWith("/commit") && method === "POST") {
			const body = request.postDataJSON() as { expectedHeadSha?: string | null };
			return options.commitConflict && body.expectedHeadSha
				? json({ error: "GitHub branch changed since this draft was created. Refresh the workspace before syncing.", code: "github_conflict" }, 409)
				: json({ commit: { sha: "e41c7d0c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a", htmlUrl: "", branch: "main", files: [] }, cdnBaseUrl: "" });
		}
		if (path.endsWith("/projects")) {
			return json({ workspace, projects: options.noWorkspaces ? [] : projects, metadata: null, metadataPresent: true, metadataPath: "projects/projects-metadata.json" });
		}
		if (path.endsWith("/history")) return json({ commits });
		if (path.includes("/history/")) return json({ project: projects[0], sketch: scene, notes: "# Older version\n" });
		if (path.includes("/sketches/")) {
			return json({
				workspace,
				projectSlug: "payments-architecture",
				sketchSlug: "system-map",
				project: projects[0],
				projectsMetadata: null,
				sketch: scene,
				notes: "# Payments architecture\n\nThe API writes to the ledger.\n",
				state: { viewMode: "split", panelSizes: [58, 42] },
				files: { project: null, sketch: null, notes: null, state: null },
			});
		}
		if (path === "/api/excalidraw/libraries") return json({ libraries: [], total: 0, source: "fixture", updatedAt: "2026-11-01T00:00:00Z" });
		return json({ error: "not mocked" }, 404);
	});

	return log;
}

export const editorPath = "/app/workspaces/ws-1/projects/payments-architecture/sketches/system-map";
