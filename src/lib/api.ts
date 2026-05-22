export type Workspace = {
	id: string;
	stackUserId: string;
	repoOwner: string;
	repoName: string;
	defaultBranch: string;
	visibility: "private" | "public";
	latestCommitSha: string | null;
	createdAt: string;
	updatedAt: string;
};

export type AuthMeResponse = {
	authenticated: boolean;
	user: {
		id: string;
		primaryEmail: string | null;
		displayName: string | null;
		profileImageUrl: string | null;
	} | null;
};

export type GithubStatus = {
	connected: boolean;
	github: {
		login: string;
		id: number;
		avatarUrl: string | null;
		htmlUrl: string;
	};
};

export type BootstrapResponse = {
	workspace: Workspace;
	repository: {
		fullName: string;
		htmlUrl: string;
		defaultBranch: string;
		private: boolean;
		created: boolean;
	};
	commit: {
		sha: string;
		htmlUrl: string;
		branch: string;
		files: string[];
	};
	cdnBaseUrl: string;
};

export type SketchScene = {
	type?: string;
	version?: number;
	source?: string;
	elements: unknown[];
	appState?: Record<string, unknown>;
	files?: Record<string, unknown>;
};

export type SketchLoadResponse = {
	workspace: Workspace;
	projectSlug: string;
	sketchSlug: string;
	project: unknown | null;
	sketch: SketchScene;
	notes: string;
	files: {
		project: unknown | null;
		sketch: unknown | null;
		notes: unknown | null;
	};
};

export type CommitResponse = {
	commit: {
		sha: string;
		htmlUrl: string;
		branch: string;
		files: string[];
	};
	cdnBaseUrl: string;
};

type ApiInit = RequestInit & {
	json?: unknown;
};

export async function apiJson<T>(url: string, init: ApiInit = {}) {
	const response = await fetch(url, {
		...init,
		headers: {
			...(init.json ? { "Content-Type": "application/json" } : null),
			...init.headers,
		},
		body: init.json ? JSON.stringify(init.json) : init.body,
	});
	const data = await response.json().catch(() => null);

	if (!response.ok) {
		const message =
			data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "Request failed";
		throw new Error(message);
	}

	return data as T;
}

export function getWorkspaces() {
	return apiJson<{ workspaces: Workspace[] }>("/api/workspaces");
}

export function getAuthMe() {
	return apiJson<AuthMeResponse>("/api/auth/me");
}

export function getGithubStatus() {
	return apiJson<GithubStatus>("/api/github/status");
}

export function bootstrapWorkspace(input: { repoName: string; private: boolean }) {
	return apiJson<BootstrapResponse>("/api/workspaces/bootstrap", {
		method: "POST",
		json: input,
	});
}

export function getSketch(input: { workspaceId: string; projectId: string; sketchId: string }) {
	return apiJson<SketchLoadResponse>(
		`/api/workspaces/${encodeURIComponent(input.workspaceId)}/projects/${encodeURIComponent(input.projectId)}/sketches/${encodeURIComponent(
			input.sketchId,
		)}`,
	);
}

export function commitWorkspaceFiles(input: {
	workspaceId: string;
	message: string;
	files: Array<{ path: string; content: string }>;
}) {
	return apiJson<CommitResponse>(`/api/workspaces/${encodeURIComponent(input.workspaceId)}/commit`, {
		method: "POST",
		json: {
			message: input.message,
			files: input.files,
		},
	});
}
