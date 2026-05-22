import { BadRequestError, HttpError } from "@/server/http";

const GITHUB_API_URL = "https://api.github.com";
const GITHUB_API_VERSION = process.env.GITHUB_API_VERSION || "2026-03-10";
const MAX_FILE_BYTES = 1_000_000;

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

export class GithubApiError extends HttpError {
	constructor(
		message: string,
		status: number,
		readonly response?: unknown,
	) {
		super(message, status);
		this.name = "GithubApiError";
	}
}

function encodePathPart(value: string) {
	return encodeURIComponent(value);
}

function repoApiPath(owner: string, repo: string, suffix = "") {
	return `/repos/${encodePathPart(owner)}/${encodePathPart(repo)}${suffix}`;
}

async function githubRequest<T>(accessToken: string, path: string, init: RequestInit = {}) {
	const response = await fetch(`${GITHUB_API_URL}${path}`, {
		...init,
		headers: {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
			"X-GitHub-Api-Version": GITHUB_API_VERSION,
			...init.headers,
		},
	});

	if (!response.ok) {
		const errorBody = await response.json().catch(() => null);
		const message =
			errorBody && typeof errorBody === "object" && "message" in errorBody && typeof errorBody.message === "string"
				? errorBody.message
				: "GitHub API request failed";
		throw new GithubApiError(message, response.status, errorBody);
	}

	if (response.status === 204) {
		return null as T;
	}

	return (await response.json()) as T;
}

export async function getAuthenticatedGithubUser(accessToken: string) {
	return githubRequest<GithubUser>(accessToken, "/user");
}

export async function getGithubRepository(accessToken: string, owner: string, repo: string) {
	return githubRequest<GithubRepository>(accessToken, repoApiPath(owner, repo));
}

export async function getBranchHeadSha(accessToken: string, owner: string, repo: string, branch: string) {
	const ref = await githubRequest<GithubRef>(accessToken, repoApiPath(owner, repo, `/git/ref/heads/${branch}`));
	return ref.object.sha;
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

export async function createUserRepository(accessToken: string, repoName: string, isPrivate: boolean) {
	return githubRequest<GithubRepository>(accessToken, "/user/repos", {
		method: "POST",
		body: JSON.stringify({
			name: repoName,
			private: isPrivate,
			auto_init: true,
			description: "Sketchflow workspace: sketches, docs, exports, and project memory.",
		}),
	});
}

export async function ensureUserRepository(accessToken: string, owner: string, repoName: string, isPrivate: boolean) {
	const githubUser = await getAuthenticatedGithubUser(accessToken);

	try {
		const repository = await getGithubRepository(accessToken, owner, repoName);
		return { githubUser, repository, created: false };
	} catch (error) {
		if (!(error instanceof GithubApiError) || error.status !== 404) {
			throw error;
		}

		if (owner !== githubUser.login) {
			throw new BadRequestError("Only existing organization repositories can be connected right now");
		}

		const repository = await createUserRepository(accessToken, repoName, isPrivate);
		return { githubUser, repository, created: true };
	}
}

export function validateGithubRepoName(repoName: string) {
	if (!/^[A-Za-z0-9_.-]+$/.test(repoName)) {
		throw new BadRequestError("Repository name can only contain letters, numbers, dots, dashes, and underscores");
	}

	if (repoName.startsWith(".") || repoName.endsWith(".")) {
		throw new BadRequestError("Repository name cannot start or end with a dot");
	}

	return repoName;
}

export function validateGithubPathSegment(segment: string) {
	return validateGithubRepoName(segment);
}

export function validateGithubFilePath(path: string) {
	if (!path || path.startsWith("/") || path.includes("..") || path.includes("\\")) {
		throw new BadRequestError(`Unsafe GitHub file path: ${path || "(empty)"}`);
	}

	return path;
}

export function validateGithubFileChange(file: GithubFileChange) {
	validateGithubFilePath(file.path);

	const size = new TextEncoder().encode(file.content).byteLength;
	if (size > MAX_FILE_BYTES) {
		throw new BadRequestError(`File is too large for Git-backed sync: ${file.path}`);
	}

	return file;
}

export async function createCommitOnBranch(input: {
	accessToken: string;
	owner: string;
	repo: string;
	branch: string;
	message: string;
	files: GithubFileChange[];
}) {
	const files = input.files.map(validateGithubFileChange);

	if (files.length === 0) {
		throw new BadRequestError("Expected at least one file to commit");
	}

	const ref = await githubRequest<GithubRef>(
		input.accessToken,
		repoApiPath(input.owner, input.repo, `/git/ref/heads/${input.branch}`),
	);
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

	await githubRequest<GithubRef>(input.accessToken, repoApiPath(input.owner, input.repo, `/git/refs/heads/${input.branch}`), {
		method: "PATCH",
		body: JSON.stringify({
			sha: commit.sha,
			force: false,
		}),
	});

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
}) {
	const now = new Date().toISOString();
	const workspace = {
		schemaVersion: 1,
		name: input.repo,
		owner: input.owner,
		repo: input.repo,
		defaultBranch: input.branch,
		visibility: "private",
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
			path: "projects/.gitkeep",
			content: "Sketchflow keeps project sketches, docs, exports, and assets in this directory.\n",
		},
	] satisfies GithubFileChange[];
}

export function jsDelivrBaseUrl(owner: string, repo: string, commitSha: string) {
	return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${commitSha}/`;
}
