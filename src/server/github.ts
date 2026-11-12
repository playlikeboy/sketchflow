import "server-only";

import { PROJECTS_METADATA_PATH, buildProjectsMetadata, projectFromProjectJson } from "@/lib/project-metadata";
import { GITHUB_REST_API_VERSION } from "@/lib/config";
import { classifyGithubFailure, parseGithubScopes, type GithubErrorCode, type GithubProblem } from "@/lib/github-errors";
import { BadRequestError, HttpError } from "@/server/errors";
import {
	validateGithubFileChange as validateFileChange,
	validateGithubFilePath as validateFilePath,
	validateGithubPathSegment as validatePathSegment,
	validateGithubRepoName as validateRepoName,
	jsDelivrBaseUrl as buildJsDelivrBaseUrl,
	encodeGithubBranch,
	validateGithubBranch as validateBranch,
	validateProjectScopedPath as validateProjectPath,
} from "@/server/github-validation";

const GITHUB_API_URL = "https://api.github.com";
const MAX_FILE_BYTES = 8_000_000;
const GITHUB_REQUEST_TIMEOUT_MS = 15_000;
// GitHub rejects REST requests that carry no User-Agent, and Workers do not add one.
const GITHUB_USER_AGENT = "Sketchflow";
const GITHUB_RETRY_DELAY_MS = 300;
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([502, 503, 504]);
const STATUS_TIMED_OUT = 504;
const STATUS_UNREACHABLE = 502;

export type GithubUser = {
	login: string;
	id: number;
	avatar_url: string | null;
	html_url: string;
};

export type GithubRepository = {
	name: string;
	full_name: string;
	private: boolean;
	description: string | null;
	homepage: string | null;
	html_url: string;
	default_branch: string;
	owner: {
		login: string;
	};
};

type GithubRef = {
	object: {
		sha: string;
		type: string;
	};
};

type GithubContentFile = {
	type: "file";
	name: string;
	path: string;
	sha: string;
	encoding: "base64" | string;
	content: string;
	html_url: string;
	download_url: string | null;
};

export type GithubDirectoryItem = {
	type: "file" | "dir" | "symlink" | "submodule";
	name: string;
	path: string;
	sha: string;
	html_url: string;
	download_url: string | null;
};

type GithubCommit = {
	sha: string;
	tree: {
		sha: string;
	};
	html_url: string;
};

type GithubTree = {
	sha: string;
};

export type GithubTreeEntry = {
	path: string;
	mode: string;
	type: "blob" | "tree";
	sha: string;
	size?: number;
	url: string;
};

export type GithubTreeResponse = {
	sha: string;
	url: string;
	tree: GithubTreeEntry[];
	truncated: boolean;
};

export type GithubFileChange = {
	path: string;
	content: string;
};

export type GithubCommitResult = {
	sha: string;
	htmlUrl: string;
	branch: string;
	files: string[];
};

export type GithubApiErrorCode = GithubErrorCode;

/**
 * A GitHub request that failed. `code` names the reason (see src/lib/github-errors.ts) and
 * `status` keeps GitHub's HTTP status. Built without a `problem`, the reason is worked out
 * from the status alone.
 */
export class GithubApiError extends HttpError {
	readonly code: GithubApiErrorCode;
	readonly retryAt?: string;

	constructor(
		message: string,
		status: number,
		readonly response?: unknown,
		problem: GithubProblem = classifyGithubFailure({ status, message }),
	) {
		super(message, status);
		this.name = "GithubApiError";
		this.code = problem.code;
		this.retryAt = problem.retryAt;
	}
}

export class GithubConflictError extends HttpError {
	readonly code = "github_conflict" as const;

	constructor(message: string) {
		super(message, 409);
		this.name = "GithubConflictError";
	}
}

function encodePathPart(value: string) {
	return encodeURIComponent(value);
}

function repoApiPath(owner: string, repo: string, suffix = "") {
	return `/repos/${encodePathPart(owner)}/${encodePathPart(repo)}${suffix}`;
}

type GithubResponse<T> = {
	data: T;
	headers: Headers;
};

function wait(milliseconds: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function isAbortError(error: unknown) {
	return error instanceof Error && error.name === "AbortError";
}

async function sendGithubRequest(accessToken: string, path: string, init: RequestInit) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), GITHUB_REQUEST_TIMEOUT_MS);

	try {
		return await fetch(`${GITHUB_API_URL}${path}`, {
			...init,
			signal: init.signal ?? controller.signal,
			headers: {
				Accept: "application/vnd.github+json",
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
				"User-Agent": GITHUB_USER_AGENT,
				"X-GitHub-Api-Version": GITHUB_REST_API_VERSION,
				...init.headers,
			},
		});
	} catch (error) {
		if (isAbortError(error)) {
			throw new GithubApiError("GitHub API request timed out", STATUS_TIMED_OUT, undefined, { code: "github_unavailable" });
		}

		// Only the failure's name and message are logged: the request itself carries the token.
		console.error("GitHub could not be reached:", error instanceof Error ? `${error.name}: ${error.message}` : "unknown error");
		throw new GithubApiError("GitHub could not be reached", STATUS_UNREACHABLE, undefined, { code: "github_unavailable" });
	} finally {
		clearTimeout(timeout);
	}
}

async function githubErrorFromResponse(response: Response) {
	const errorBody: unknown = await response.json().catch(() => null);
	const message =
		errorBody && typeof errorBody === "object" && "message" in errorBody && typeof errorBody.message === "string"
			? errorBody.message
			: "GitHub API request failed";

	return new GithubApiError(
		message,
		response.status,
		errorBody,
		classifyGithubFailure({ status: response.status, message, headers: response.headers }),
	);
}

async function attemptGithubRequest<T>(accessToken: string, path: string, init: RequestInit): Promise<GithubResponse<T>> {
	const response = await sendGithubRequest(accessToken, path, init);

	if (!response.ok) {
		throw await githubErrorFromResponse(response);
	}

	const data = response.status === 204 ? (null as T) : ((await response.json()) as T);
	return { data, headers: response.headers };
}

// Reads are safe to repeat; a write that timed out may already have been applied.
function isIdempotentRead(init: RequestInit) {
	return (init.method ?? "GET").toUpperCase() === "GET";
}

function isWorthRetrying(error: unknown) {
	return error instanceof GithubApiError && RETRYABLE_STATUSES.has(error.status);
}

/** Calls GitHub, repeating a read once after a short pause when GitHub timed out or faltered. */
async function githubFetch<T>(accessToken: string, path: string, init: RequestInit = {}): Promise<GithubResponse<T>> {
	try {
		return await attemptGithubRequest<T>(accessToken, path, init);
	} catch (error) {
		if (!isIdempotentRead(init) || !isWorthRetrying(error)) {
			throw error;
		}

		await wait(GITHUB_RETRY_DELAY_MS);
		return attemptGithubRequest<T>(accessToken, path, init);
	}
}

async function githubRequest<T>(accessToken: string, path: string, init: RequestInit = {}) {
	const { data } = await githubFetch<T>(accessToken, path, init);
	return data;
}

export async function getAuthenticatedGithubUser(accessToken: string) {
	return githubRequest<GithubUser>(accessToken, "/user");
}

/**
 * The signed-in GitHub user together with the scopes the token was granted. `grantedScopes`
 * is null for tokens that do not report scopes (fine-grained and GitHub App tokens).
 */
export async function getAuthenticatedGithubUserWithScopes(accessToken: string) {
	const { data, headers } = await githubFetch<GithubUser>(accessToken, "/user");
	return { githubUser: data, grantedScopes: parseGithubScopes(headers.get("x-oauth-scopes")) };
}

export async function getGithubRepository(accessToken: string, owner: string, repo: string) {
	return githubRequest<GithubRepository>(accessToken, repoApiPath(owner, repo));
}

export async function updateRepositoryDetails(input: {
	accessToken: string;
	owner: string;
	repo: string;
	description: string;
	homepage: string;
	isPrivate: boolean;
}) {
	return githubRequest<GithubRepository>(input.accessToken, repoApiPath(input.owner, input.repo), {
		method: "PATCH",
		body: JSON.stringify({
			description: input.description,
			homepage: input.homepage,
			private: input.isPrivate,
		}),
	});
}

export async function getBranchHeadSha(accessToken: string, owner: string, repo: string, branch: string) {
	const ref = await githubRequest<GithubRef>(accessToken, repoApiPath(owner, repo, `/git/ref/heads/${encodeGithubBranch(branch)}`));
	return ref.object.sha;
}

export async function getGithubTreeRecursive(input: {
	accessToken: string;
	owner: string;
	repo: string;
	treeShaOrBranch: string;
}) {
	return githubRequest<GithubTreeResponse>(
		input.accessToken,
		repoApiPath(input.owner, input.repo, `/git/trees/${encodeURIComponent(input.treeShaOrBranch)}?recursive=1`),
	);
}

export async function getPathCommits(input: {
	accessToken: string;
	owner: string;
	repo: string;
	path: string;
}) {
	validateGithubFilePath(input.path);

	return githubRequest<unknown[]>(
		input.accessToken,
		repoApiPath(input.owner, input.repo, `/commits?path=${encodeURIComponent(input.path)}`),
	);
}

export async function readGithubFileText(input: {
	accessToken: string;
	owner: string;
	repo: string;
	path: string;
	ref: string;
}) {
	validateGithubFilePath(input.path);

	const file = await githubRequest<GithubContentFile>(
		input.accessToken,
		repoApiPath(input.owner, input.repo, `/contents/${input.path.split("/").map(encodePathPart).join("/")}?ref=${encodeURIComponent(input.ref)}`),
	);

	if (file.type !== "file" || file.encoding !== "base64") {
		throw new BadRequestError(`Unsupported GitHub content response for ${input.path}`);
	}

	const compactBase64 = file.content.replace(/\s/g, "");
	const bytes = Uint8Array.from(atob(compactBase64), (char) => char.charCodeAt(0));

	return {
		path: file.path,
		sha: file.sha,
		htmlUrl: file.html_url,
		downloadUrl: file.download_url,
		content: new TextDecoder().decode(bytes),
	};
}

export async function listGithubDirectory(input: {
	accessToken: string;
	owner: string;
	repo: string;
	path: string;
	ref: string;
}) {
	validateGithubFilePath(input.path);

	const content = await githubRequest<GithubDirectoryItem[] | GithubContentFile>(
		input.accessToken,
		repoApiPath(input.owner, input.repo, `/contents/${input.path.split("/").map(encodePathPart).join("/")}?ref=${encodeURIComponent(input.ref)}`),
	);

	if (!Array.isArray(content)) {
		throw new BadRequestError(`Expected GitHub directory content for ${input.path}`);
	}

	return content;
}

export async function createUserRepository(accessToken: string, repoName: string, isPrivate: boolean, appUrl: string) {
	return githubRequest<GithubRepository>(accessToken, "/user/repos", {
		method: "POST",
		body: JSON.stringify({
			name: repoName,
			private: isPrivate,
			auto_init: true,
			description: "Sketchflow workspace: sketches, docs, exports, and project memory.",
			homepage: appUrl,
		}),
	});
}

export async function ensureUserRepository(accessToken: string, owner: string, repoName: string, isPrivate: boolean, appUrl: string) {
	const githubUser = await getAuthenticatedGithubUser(accessToken);

	try {
		// Existing repositories belong to the user: connect them as-is, without rewriting their details.
		const repository = await getGithubRepository(accessToken, owner, repoName);
		return { githubUser, repository, created: false };
	} catch (error) {
		if (!(error instanceof GithubApiError) || error.status !== 404) {
			throw error;
		}

		if (owner !== githubUser.login) {
			throw new BadRequestError("Only existing organization repositories can be connected right now");
		}

		const repository = await createUserRepository(accessToken, repoName, isPrivate, appUrl);
		return { githubUser, repository, created: true };
	}
}

export function validateGithubRepoName(repoName: string) {
	try {
		return validateRepoName(repoName);
	} catch (error) {
		throw new BadRequestError(error instanceof Error ? error.message : "Invalid GitHub repository name");
	}
}

export function validateGithubPathSegment(segment: string) {
	try {
		return validatePathSegment(segment);
	} catch (error) {
		throw new BadRequestError(error instanceof Error ? error.message : "Invalid GitHub path segment");
	}
}

export function validateGithubFilePath(path: string) {
	try {
		return validateFilePath(path);
	} catch (error) {
		throw new BadRequestError(error instanceof Error ? error.message : "Unsafe GitHub file path");
	}
}

export function validateGithubBranch(branch: string) {
	try {
		return validateBranch(branch);
	} catch (error) {
		throw new BadRequestError(error instanceof Error ? error.message : "Invalid branch name");
	}
}

export function validateProjectScopedPath(projectId: string, path: unknown) {
	try {
		return validateProjectPath(projectId, path);
	} catch (error) {
		throw new BadRequestError(error instanceof Error ? error.message : "Invalid project path");
	}
}

export function parseRepoJson(content: string, path: string): unknown {
	try {
		return JSON.parse(content);
	} catch {
		throw new BadRequestError(`${path} is not valid JSON`);
	}
}

export function validateGithubFileChange(file: GithubFileChange) {
	try {
		return validateFileChange(file, MAX_FILE_BYTES);
	} catch (error) {
		throw new BadRequestError(error instanceof Error ? error.message : "Invalid GitHub file");
	}
}

export async function createCommitOnBranch(input: {
	accessToken: string;
	owner: string;
	repo: string;
	branch: string;
	message: string;
	files: GithubFileChange[];
	expectedHeadSha?: string | null;
}) {
	const files = input.files.map(validateGithubFileChange);

	if (files.length === 0) {
		throw new BadRequestError("Expected at least one file to commit");
	}

	const ref = await githubRequest<GithubRef>(
		input.accessToken,
		repoApiPath(input.owner, input.repo, `/git/ref/heads/${encodeGithubBranch(input.branch)}`),
	);
	if (input.expectedHeadSha && input.expectedHeadSha !== ref.object.sha) {
		throw new GithubConflictError("GitHub branch changed since this draft was created. Refresh the workspace before syncing.");
	}

	const parentCommit = await githubRequest<GithubCommit>(
		input.accessToken,
		repoApiPath(input.owner, input.repo, `/git/commits/${ref.object.sha}`),
	);
	const tree = await githubRequest<GithubTree>(input.accessToken, repoApiPath(input.owner, input.repo, "/git/trees"), {
		method: "POST",
		body: JSON.stringify({
			base_tree: parentCommit.tree.sha,
			tree: files.map((file) => ({
				path: file.path,
				mode: "100644",
				type: "blob",
				content: file.content,
			})),
		}),
	});
	const commit = await githubRequest<GithubCommit>(input.accessToken, repoApiPath(input.owner, input.repo, "/git/commits"), {
		method: "POST",
		body: JSON.stringify({
			message: input.message,
			tree: tree.sha,
			parents: [parentCommit.sha],
		}),
	});

	try {
		await githubRequest<GithubRef>(input.accessToken, repoApiPath(input.owner, input.repo, `/git/refs/heads/${encodeGithubBranch(input.branch)}`), {
			method: "PATCH",
			body: JSON.stringify({
			sha: commit.sha,
			force: false,
		}),
		});
	} catch (error) {
		if (error instanceof GithubApiError && error.status === 422) {
			throw new GithubConflictError("GitHub branch changed while syncing. Your local changes were not discarded.");
		}
		throw error;
	}

	return {
		sha: commit.sha,
		htmlUrl: commit.html_url,
		branch: input.branch,
		files: files.map((file) => file.path),
	} satisfies GithubCommitResult;
}

export function buildInitialWorkspaceFiles(input: {
	owner: string;
	repo: string;
	branch: string;
	stackUserId: string;
	githubLogin: string;
	appUrl: string;
	visibility: "private" | "public";
}) {
	const now = new Date().toISOString();
	const projectSlug = "first-project";
	const sketchSlug = "system-map";
	const firstProject = projectFromProjectJson({
		projectId: projectSlug,
		projectJson: {
			id: projectSlug,
			title: "First Project",
			visibility: input.visibility,
			createdAt: now,
			updatedAt: now,
			sketches: [
				{
					id: sketchSlug,
					title: "System Map",
					file: `projects/${projectSlug}/sketches/${sketchSlug}.excalidraw.json`,
				},
			],
			docs: {
				notes: `projects/${projectSlug}/docs/notes.md`,
			},
			sharing: {
				enabled: input.visibility === "public",
				embed: input.visibility === "public",
			},
		},
		fallbackVisibility: input.visibility,
		fallbackSketchId: sketchSlug,
		now,
	});
	const workspace = {
		schemaVersion: 1,
		name: input.repo,
		owner: input.owner,
		repo: input.repo,
		defaultBranch: input.branch,
		visibility: input.visibility,
		appUrl: input.appUrl,
		createdAt: now,
		updatedAt: now,
		createdBy: {
			stackUserId: input.stackUserId,
			githubLogin: input.githubLogin,
		},
	};

	return [
		{
			path: ".sketchflow/workspace.json",
			content: `${JSON.stringify(workspace, null, 2)}\n`,
		},
		{
			path: ".sketchflow/manifest.json",
			content: `${JSON.stringify(
				{
					schemaVersion: 1,
					workspaceFile: ".sketchflow/workspace.json",
					indexes: {
						projects: ".sketchflow/indexes/projects.json",
						publicProjects: ".sketchflow/indexes/public-projects.json",
						search: ".sketchflow/indexes/search-index.json",
					},
					conventions: {
						projectRoot: "projects",
						sketchExtension: ".excalidraw.json",
						exportsDir: "exports",
						assetsDir: "assets",
					},
				},
				null,
				2,
			)}\n`,
		},
		{
			path: ".sketchflow/indexes/projects.json",
			content: `${JSON.stringify(
				{
					projects: [
						{
							id: projectSlug,
							title: "First Project",
							visibility: input.visibility,
							projectFile: `projects/${projectSlug}/project.json`,
							defaultSketch: `projects/${projectSlug}/sketches/${sketchSlug}.excalidraw.json`,
							share: {
								enabled: input.visibility === "public",
								path: `projects/${projectSlug}`,
							},
						},
					],
				},
				null,
				2,
			)}\n`,
		},
		{
			path: PROJECTS_METADATA_PATH,
			content: `${JSON.stringify(
				buildProjectsMetadata({
					projects: [firstProject],
					workspace: {
						owner: input.owner,
						repo: input.repo,
						defaultBranch: input.branch,
					},
					now,
				}),
				null,
				2,
			)}\n`,
		},
		{
			path: ".sketchflow/latest.json",
			content: `${JSON.stringify({ updatedAt: now, note: "Latest commit is tracked by Sketchflow API responses." }, null, 2)}\n`,
		},
		{
			path: ".sketchflow/indexes/public-projects.json",
			content: `${JSON.stringify({ projects: [] }, null, 2)}\n`,
		},
		{
			path: ".sketchflow/indexes/search-index.json",
			content: `${JSON.stringify({ documents: [] }, null, 2)}\n`,
		},
		{
			path: "README.md",
			content: `# ${input.repo}\n\nThis is a Sketchflow workspace.\n\nSketches, docs, exports, assets, and project metadata live in this repository so the workspace stays portable and versioned with Git.\n\nOpen the workspace in Sketchflow: ${input.appUrl}\n\n## Structure\n\n- \`.sketchflow/\` workspace manifests, indexes, and sync metadata\n- \`projects/\` project sketches, docs, exports, and assets\n- \`projects/${projectSlug}/sketches/${sketchSlug}.excalidraw.json\` first Excalidraw scene\n\n`,
		},
		{
			path: `projects/${projectSlug}/project.json`,
			content: `${JSON.stringify(
				{
					schemaVersion: 1,
					id: projectSlug,
					title: "First Project",
					visibility: input.visibility,
					createdAt: now,
					updatedAt: now,
					projectFile: `projects/${projectSlug}/project.json`,
					defaultSketch: `projects/${projectSlug}/sketches/${sketchSlug}.excalidraw.json`,
					sketches: [
						{
							id: sketchSlug,
							title: "System Map",
							file: `projects/${projectSlug}/sketches/${sketchSlug}.excalidraw.json`,
						},
					],
					docs: {
						notes: `projects/${projectSlug}/docs/notes.md`,
					},
					sharing: {
						enabled: input.visibility === "public",
						embed: input.visibility === "public",
					},
				},
				null,
				2,
			)}\n`,
		},
		{
			path: `projects/${projectSlug}/sketches/${sketchSlug}.excalidraw.json`,
			content: `${JSON.stringify(
				{
					type: "excalidraw",
					version: 2,
					source: input.appUrl,
					elements: [],
					appState: {
						viewBackgroundColor: "#000000",
					},
					files: {},
				},
				null,
				2,
			)}\n`,
		},
		{
			path: `projects/${projectSlug}/docs/notes.md`,
			content: `# First Project\n\nUse this project for sketches, architecture notes, exports, and shareable visual docs.\n`,
		},
		{
			path: `projects/${projectSlug}/exports/.gitkeep`,
			content: "Exports generated by Sketchflow can live here.\n",
		},
		{
			path: `projects/${projectSlug}/assets/.gitkeep`,
			content: "Images and project assets can live here.\n",
		},
		{
			path: `projects/${projectSlug}/state.json`,
			content: `${JSON.stringify(
				{
					viewMode: "split",
					lastActiveSketchId: sketchSlug,
					updatedAt: now,
				},
				null,
				2,
			)}\n`,
		},
	] satisfies GithubFileChange[];
}

export function jsDelivrBaseUrl(owner: string, repo: string, commitSha: string) {
	return buildJsDelivrBaseUrl(owner, repo, commitSha);
}
