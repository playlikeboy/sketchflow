import {
	PROJECTS_METADATA_PATH,
	buildProjectsMetadata,
	normalizeProjectsMetadata,
	projectFromProjectJson,
	type ProjectsMetadata,
	type WorkspaceProject,
} from "@/lib/project-metadata";
import { GITHUB_REST_API_VERSION, SKETCHFLOW_APP_URL } from "@/lib/config";
import { hasLocalGithubToken, normalizeStackUser, requireGithubAccessToken, requireUser } from "@/server/auth";
import { getWorkspace, recordSyncEvent, updateWorkspaceCommit, upsertWorkspace } from "@/server/db/repositories";
import { getGithubOAuthScopes } from "@/server/env";
import {
	GithubApiError,
	type GithubDirectoryItem,
	createCommitOnBranch,
	getBranchHeadSha,
	getGithubRepository,
	jsDelivrBaseUrl,
	listGithubDirectory,
	readGithubFileText,
	validateGithubPathSegment,
} from "@/server/github";
import { BadRequestError, jsonError, jsonOk, NotFoundError } from "@/server/http";
import { isJsonObject, optionalString } from "@/server/validation";
import { humanizeSlug, notesFilePath, projectFilePath, sketchFilePath, slugify } from "@/lib/sketchflow";

const PUBLIC_GITHUB_API_URL = "https://api.github.com";
const PUBLIC_GITHUB_TIMEOUT_MS = 10_000;

async function publicGithubFetch(url: string) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), PUBLIC_GITHUB_TIMEOUT_MS);

	try {
		return await fetch(url, {
			signal: controller.signal,
			headers: {
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": GITHUB_REST_API_VERSION,
			},
		});
	} finally {
		clearTimeout(timeout);
	}
}

function publicRepoApiPath(owner: string, repo: string, suffix = "") {
	return `${PUBLIC_GITHUB_API_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${suffix}`;
}

async function readOptionalJson(input: {
	accessToken: string;
	owner: string;
	repo: string;
	ref: string;
	path: string;
}) {
	try {
		const file = await readGithubFileText(input);
		return {
			file,
			json: JSON.parse(file.content) as unknown,
		};
	} catch (error) {
		if (error instanceof GithubApiError && error.status === 404) {
			return null;
		}

		throw error;
	}
}

async function listProjectFolders(input: {
	accessToken: string;
	owner: string;
	repo: string;
	ref: string;
}) {
	try {
		const items = await listGithubDirectory({ ...input, path: "projects" });
		return items
			.filter((item) => item.type === "dir")
			.map((item) => validateGithubPathSegment(item.name));
	} catch (error) {
		if (error instanceof GithubApiError && error.status === 404) {
			return [];
		}

		throw error;
	}
}

async function getPublicBranchHeadSha(owner: string, repo: string, branch: string) {
	const response = await publicGithubFetch(publicRepoApiPath(owner, repo, `/git/ref/heads/${encodeURIComponent(branch)}`));

	if (!response.ok) {
		return null;
	}

	const data = (await response.json()) as { object?: { sha?: string } };
	return typeof data.object?.sha === "string" ? data.object.sha : null;
}

async function readPublicOptionalJson(input: {
	owner: string;
	repo: string;
	ref: string;
	path: string;
}) {
	const url = `https://raw.githubusercontent.com/${encodeURIComponent(input.owner)}/${encodeURIComponent(
		input.repo,
	)}/${encodeURIComponent(input.ref)}/${input.path.split("/").map(encodeURIComponent).join("/")}`;
	const response = await publicGithubFetch(url);

	if (response.status === 404) {
		return null;
	}

	if (!response.ok) {
		throw new GithubApiError("Public GitHub file read failed", response.status);
	}

	return {
		file: null,
		json: (await response.json()) as unknown,
	};
}

async function listPublicProjectFolders(input: {
	owner: string;
	repo: string;
	ref: string;
}) {
	const response = await publicGithubFetch(
		publicRepoApiPath(
			input.owner,
			input.repo,
			`/contents/projects?ref=${encodeURIComponent(input.ref)}`,
		),
	);

	if (response.status === 404) {
		return [];
	}

	if (!response.ok) {
		throw new GithubApiError("Public GitHub directory read failed", response.status);
	}

	const items = (await response.json()) as GithubDirectoryItem[];
	return items
		.filter((item) => item.type === "dir")
		.map((item) => validateGithubPathSegment(item.name));
}

async function readWorkspaceProjects(input: {
	accessToken: string;
	workspace: {
		repoOwner: string;
		repoName: string;
		defaultBranch: string;
		visibility: "private" | "public";
	};
}) {
	const base = {
		accessToken: input.accessToken,
		owner: input.workspace.repoOwner,
		repo: input.workspace.repoName,
		ref: input.workspace.defaultBranch,
	};
	const [latestCommitSha, metadataFile, projectFolders] = await Promise.all([
		getBranchHeadSha(input.accessToken, input.workspace.repoOwner, input.workspace.repoName, input.workspace.defaultBranch),
		readOptionalJson({ ...base, path: PROJECTS_METADATA_PATH }),
		listProjectFolders(base),
	]);
	const metadata = normalizeProjectsMetadata(metadataFile?.json);
	const projectsById = new Map<string, WorkspaceProject>();

	for (const project of metadata?.projects ?? []) {
		projectsById.set(project.id, project);
	}

	const projectFiles = await Promise.all(
		projectFolders.map(async (projectId) => ({
			projectId,
			projectFile: await readOptionalJson({ ...base, path: `projects/${projectId}/project.json` }),
		})),
	);

	for (const { projectId, projectFile } of projectFiles) {
		const project = projectFromProjectJson({
			projectId,
			projectJson: projectFile?.json ?? null,
			fallbackVisibility: input.workspace.visibility,
		});
		projectsById.set(project.id, project);
	}

	const projects = [...projectsById.values()].sort((a, b) => a.title.localeCompare(b.title));

	return {
		latestCommitSha,
		metadataPresent: Boolean(metadataFile),
		metadata,
		projects,
	};
}

async function readPublicWorkspaceProjects(input: {
	workspace: {
		repoOwner: string;
		repoName: string;
		defaultBranch: string;
		visibility: "private" | "public";
		latestCommitSha: string | null;
	};
}) {
	const base = {
		owner: input.workspace.repoOwner,
		repo: input.workspace.repoName,
		ref: input.workspace.defaultBranch,
	};
	const metadataFile = await readPublicOptionalJson({ ...base, path: PROJECTS_METADATA_PATH });
	const metadata = normalizeProjectsMetadata(metadataFile?.json);
	const projectsById = new Map<string, WorkspaceProject>();

	for (const project of metadata?.projects ?? []) {
		projectsById.set(project.id, project);
	}

	if (projectsById.size > 0) {
		return {
			latestCommitSha: input.workspace.latestCommitSha,
			metadataPresent: Boolean(metadataFile),
			metadata,
			projects: [...projectsById.values()].sort((a, b) => a.title.localeCompare(b.title)),
		};
	}

	const [latestCommitSha, projectFolders] = await Promise.all([
		getPublicBranchHeadSha(input.workspace.repoOwner, input.workspace.repoName, input.workspace.defaultBranch).catch(
			() => input.workspace.latestCommitSha,
		),
		listPublicProjectFolders(base).catch(() => []),
	]);
	const projectFiles = await Promise.all(
		projectFolders.map(async (projectId) => ({
			projectId,
			projectFile: await readPublicOptionalJson({ ...base, path: `projects/${projectId}/project.json` }).catch(() => null),
		})),
	);

	for (const { projectId, projectFile } of projectFiles) {
		const project = projectFromProjectJson({
			projectId,
			projectJson: projectFile?.json ?? null,
			fallbackVisibility: input.workspace.visibility,
		});
		projectsById.set(project.id, project);
	}

	const projects = [...projectsById.values()].sort((a, b) => a.title.localeCompare(b.title));

	return {
		latestCommitSha,
		metadataPresent: Boolean(metadataFile),
		metadata,
		projects,
	};
}

async function readAuthenticatedWorkspaceProjects(
	request: Request,
	workspace: {
		repoOwner: string;
		repoName: string;
		defaultBranch: string;
		visibility: "private" | "public";
	},
) {
	const scopes = getGithubOAuthScopes();
	const { accessToken } = await requireGithubAccessToken(scopes, request);
	return readWorkspaceProjects({ accessToken, workspace });
}

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ workspaceId: string }> },
) {
	try {
		const { workspaceId } = await params;
		const user = normalizeStackUser(await requireUser());
		let workspace = await getWorkspace(user.id, workspaceId);

		if (!workspace) {
			throw new NotFoundError("Workspace not found");
		}

		let dynamicVisibility = workspace.visibility;
		try {
			const scopes = getGithubOAuthScopes();
			const { accessToken } = await requireGithubAccessToken(scopes, request);
			const repoDetails = await getGithubRepository(accessToken, workspace.repoOwner, workspace.repoName);
			dynamicVisibility = repoDetails.private ? "private" : "public";

			if (dynamicVisibility !== workspace.visibility) {
				workspace = await upsertWorkspace(user.id, {
					repoOwner: workspace.repoOwner,
					repoName: workspace.repoName,
					visibility: dynamicVisibility,
				});
			}
		} catch (error) {
			// Fallback silently on network/auth errors to maintain static DB visibility
		}

		let result =
			workspace.visibility === "public" && !hasLocalGithubToken(request)
				? await readPublicWorkspaceProjects({ workspace }).catch(() => readAuthenticatedWorkspaceProjects(request, workspace))
				: await readAuthenticatedWorkspaceProjects(request, workspace);

		if (workspace.visibility === "public" && !result.metadataPresent && result.projects.length === 0) {
			result = await readAuthenticatedWorkspaceProjects(request, workspace);
		}

		return jsonOk({
			workspace: {
				...workspace,
				latestCommitSha: result.latestCommitSha,
			},
			projects: result.projects,
			metadata: result.metadata,
			metadataPresent: result.metadataPresent,
			metadataPath: PROJECTS_METADATA_PATH,
		});
	} catch (error) {
		return jsonError(error);
	}
}

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ workspaceId: string }> },
) {
	try {
		const { workspaceId } = await params;
		const scopes = getGithubOAuthScopes();
		const { accessToken, user } = await requireGithubAccessToken(scopes, request);
		const workspace = await getWorkspace(user.id, workspaceId);

		if (!workspace) {
			throw new NotFoundError("Workspace not found");
		}

		const body = await request.json().catch(() => ({}));
		if (!isJsonObject(body)) {
			throw new BadRequestError("Expected a JSON object body");
		}

		const result = await readWorkspaceProjects({ accessToken, workspace });
		const workspaceMetadata = {
			owner: workspace.repoOwner,
			repo: workspace.repoName,
			defaultBranch: workspace.defaultBranch,
		};
		const files = [];
		let metadata: ProjectsMetadata;
		let eventType = "projects_metadata_synced";
		let message = "Update Sketchflow projects metadata";

		if (optionalString(body, "mode") === "create") {
			const title = optionalString(body, "title") || "Untitled Project";
			const projectId = validateGithubPathSegment(optionalString(body, "projectId") || slugify(title));
			const sketchId = validateGithubPathSegment(optionalString(body, "sketchId") || "system-map");
			const visibility = optionalString(body, "visibility") === "private" ? "private" : workspace.visibility;
			const now = new Date().toISOString();
			const existing = result.projects.find((project) => project.id === projectId);
			if (existing) {
				throw new BadRequestError(`Project "${projectId}" already exists in this workspace`);
			}
			const project = projectFromProjectJson({
				projectId,
				projectJson: {
					id: projectId,
					title,
					description: optionalString(body, "description"),
					visibility,
					createdAt: now,
					updatedAt: now,
					projectFile: projectFilePath(projectId),
					defaultSketch: sketchFilePath(projectId, sketchId),
					sketches: [
						{
							id: sketchId,
							title: humanizeSlug(sketchId),
							file: sketchFilePath(projectId, sketchId),
						},
					],
					docs: {
						notes: notesFilePath(projectId),
					},
					sharing: {
						enabled: visibility === "public",
						embed: visibility === "public",
					},
				},
				fallbackVisibility: visibility,
				fallbackSketchId: sketchId,
				now,
			});

			metadata = buildProjectsMetadata({
				projects: [
					project,
					...result.projects.filter((currentProject) => currentProject.id !== project.id),
				],
				workspace: workspaceMetadata,
				now,
			});
			files.push(
				{
					path: project.projectFile,
					content: `${JSON.stringify(
						{
							schemaVersion: 1,
							id: project.id,
							title: project.title,
							description: project.description,
							visibility: project.visibility,
							createdAt: project.createdAt ?? now,
							updatedAt: project.updatedAt,
							projectFile: project.projectFile,
							defaultSketch: project.defaultSketch,
							sketches: project.sketches,
							docs: {
								notes: project.notesFile,
							},
							sharing: project.sharing,
						},
						null,
						2,
					)}\n`,
				},
				{
					path: project.defaultSketch,
					content: `${JSON.stringify(
						{
							type: "excalidraw",
							version: 2,
							source: SKETCHFLOW_APP_URL,
							elements: [],
							appState: {
								viewBackgroundColor: "#ffffff",
							},
							files: {},
						},
						null,
						2,
					)}\n`,
				},
				{
					path: project.notesFile,
					content: `# ${project.title}\n\nUse this project for sketches, architecture notes, exports, and shareable visual docs.\n`,
				},
				{
					path: `projects/${project.id}/exports/.gitkeep`,
					content: "Exports generated by Sketchflow can live here.\n",
				},
				{
					path: `projects/${project.id}/assets/.gitkeep`,
					content: "Images and project assets can live here.\n",
				},
			);
			eventType = "project_created";
			message = `Create ${project.title}`;
		} else {
			metadata = buildProjectsMetadata({
				projects: result.projects,
				workspace: workspaceMetadata,
			}) satisfies ProjectsMetadata;
		}

		files.push({
			path: PROJECTS_METADATA_PATH,
			content: `${JSON.stringify(metadata, null, 2)}\n`,
		});
		const commit = await createCommitOnBranch({
			accessToken,
			owner: workspace.repoOwner,
			repo: workspace.repoName,
			branch: workspace.defaultBranch,
			message,
			files,
		});

		await updateWorkspaceCommit(workspace.id, commit.sha);
		await recordSyncEvent({
			workspaceId: workspace.id,
			stackUserId: user.id,
			eventType,
			commitSha: commit.sha,
			message,
			metadata: {
				path: PROJECTS_METADATA_PATH,
				projects: metadata.projects.map((project) => project.id),
			},
		});

		return jsonOk({
			workspace: {
				...workspace,
				latestCommitSha: commit.sha,
			},
			projects: metadata.projects,
			metadata,
			metadataPresent: true,
			metadataPath: PROJECTS_METADATA_PATH,
			commit,
			cdnBaseUrl: jsDelivrBaseUrl(workspace.repoOwner, workspace.repoName, commit.sha),
		});
	} catch (error) {
		return jsonError(error);
	}
}
