import type { ProjectsMetadata, WorkspaceProject } from "@/lib/project-metadata";
import type { ExcalidrawLibrariesResponse } from "@/lib/excalidraw-libraries";
import { getStoredGithubToken } from "@/lib/github-token";

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

export type GithubStatus =
	| {
			connected: true;
			scopes: string[];
			github: {
				login: string;
				id: number;
				avatarUrl: string | null;
				htmlUrl: string;
			};
			source?: "stack-auth" | "local-token";
	  }
	| {
			connected: false;
			reason: "github_not_connected" | "github_oauth_app_required" | "github_token_unavailable";
			message: string;
			scopes: string[];
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
	projectsMetadata: ProjectsMetadata | null;
	sketch: SketchScene;
	notes: string;
	files: {
		project: unknown | null;
		sketch: unknown | null;
		notes: unknown | null;
	};
};

export type WorkspaceProjectsResponse = {
	workspace: Workspace;
	projects: WorkspaceProject[];
	metadata: ProjectsMetadata | null;
	metadataPresent: boolean;
	metadataPath: string;
	commit?: {
		sha: string;
		htmlUrl: string;
		branch: string;
		files: string[];
	};
	cdnBaseUrl?: string;
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

export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly code?: string,
	) {
		super(message);
		this.name = "ApiError";
	}
}

export async function apiJson<T>(url: string, init: ApiInit = {}) {
	const githubToken = getStoredGithubToken();
	const response = await fetch(url, {
		...init,
		credentials: "same-origin",
		headers: {
			...(init.json ? { "Content-Type": "application/json" } : null),
			...(githubToken ? { "X-Sketchflow-Github-Token": githubToken } : null),
			...init.headers,
		},
		body: init.json ? JSON.stringify(init.json) : init.body,
	});
	const data = await response.json().catch(() => null);

	if (!response.ok) {
		const message =
			data && typeof data === "object" && "error" in data && typeof data.error === "string"
				? data.error
				: `Request failed with status ${response.status}`;
		const code = data && typeof data === "object" && "code" in data && typeof data.code === "string" ? data.code : undefined;
		throw new ApiError(message, response.status, code);
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

export function getExcalidrawLibraries() {
	return apiJson<ExcalidrawLibrariesResponse>("/api/excalidraw/libraries");
}

export function bootstrapWorkspace(input: { repoName: string; private?: boolean }) {
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

export function getWorkspaceProjects(workspaceId: string) {
	return apiJson<WorkspaceProjectsResponse>(`/api/workspaces/${encodeURIComponent(workspaceId)}/projects`);
}

export function syncWorkspaceProjectsMetadata(workspaceId: string) {
	return apiJson<WorkspaceProjectsResponse>(`/api/workspaces/${encodeURIComponent(workspaceId)}/projects`, {
		method: "POST",
	});
}

export function createWorkspaceProject(input: {
	workspaceId: string;
	title: string;
	description?: string;
	projectId?: string;
	sketchId?: string;
	visibility?: "private" | "public";
}) {
	return apiJson<WorkspaceProjectsResponse>(`/api/workspaces/${encodeURIComponent(input.workspaceId)}/projects`, {
		method: "POST",
		json: {
			mode: "create",
			title: input.title,
			description: input.description,
			projectId: input.projectId,
			sketchId: input.sketchId,
			visibility: input.visibility,
		},
	});
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

export type CommitHistoryResponse = {
	commits: Array<{
		sha: string;
		message: string;
		authorName: string;
		authorDate: string;
		htmlUrl: string;
	}>;
};

export type ProjectSnapshotResponse = {
	project: unknown;
	sketch: SketchScene | null;
	notes: string;
};

export function getProjectHistory(workspaceId: string, projectId: string) {
	return apiJson<CommitHistoryResponse>(
		`/api/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}/history`,
	);
}

export function getProjectHistorySnapshot(workspaceId: string, projectId: string, commitSha: string) {
	return apiJson<ProjectSnapshotResponse>(
		`/api/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}/history/${encodeURIComponent(
			commitSha,
		)}`,
	);
}
