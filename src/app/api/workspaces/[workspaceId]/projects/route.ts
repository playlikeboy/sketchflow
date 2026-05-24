import {
	PROJECTS_METADATA_PATH,
	buildProjectsMetadata,
	normalizeProjectsMetadata,
	projectFromProjectJson,
	type ProjectsMetadata,
	type WorkspaceProject,
} from "@/lib/project-metadata";
import { requireGithubAccessToken } from "@/server/auth";
import { getWorkspace, recordSyncEvent, updateWorkspaceCommit } from "@/server/db/repositories";
import { getGithubOAuthScopes } from "@/server/env";
import {
	GithubApiError,
	createCommitOnBranch,
	getBranchHeadSha,
	jsDelivrBaseUrl,
	listGithubDirectory,
	readGithubFileText,
	validateGithubPathSegment,
} from "@/server/github";
import { jsonError, jsonOk, NotFoundError } from "@/server/http";

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

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ workspaceId: string }> },
) {
	try {
		const { workspaceId } = await params;
		const scopes = getGithubOAuthScopes();
		const { accessToken, user } = await requireGithubAccessToken(scopes);
		const workspace = await getWorkspace(user.id, workspaceId);

		if (!workspace) {
			throw new NotFoundError("Workspace not found");
		}

		const result = await readWorkspaceProjects({ accessToken, workspace });

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
	_request: Request,
	{ params }: { params: Promise<{ workspaceId: string }> },
) {
	try {
		const { workspaceId } = await params;
		const scopes = getGithubOAuthScopes();
		const { accessToken, user } = await requireGithubAccessToken(scopes);
		const workspace = await getWorkspace(user.id, workspaceId);

		if (!workspace) {
			throw new NotFoundError("Workspace not found");
		}

		const result = await readWorkspaceProjects({ accessToken, workspace });
		const metadata = buildProjectsMetadata({
			projects: result.projects,
			workspace: {
				owner: workspace.repoOwner,
				repo: workspace.repoName,
				defaultBranch: workspace.defaultBranch,
			},
		}) satisfies ProjectsMetadata;
		const commit = await createCommitOnBranch({
			accessToken,
			owner: workspace.repoOwner,
			repo: workspace.repoName,
			branch: workspace.defaultBranch,
			message: "Update Sketchflow projects metadata",
			files: [
				{
					path: PROJECTS_METADATA_PATH,
					content: `${JSON.stringify(metadata, null, 2)}\n`,
				},
			],
		});

		await updateWorkspaceCommit(workspace.id, commit.sha);
		await recordSyncEvent({
			workspaceId: workspace.id,
			stackUserId: user.id,
			eventType: "projects_metadata_synced",
			commitSha: commit.sha,
			message: "Updated projects metadata index",
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
