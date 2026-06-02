import { PROJECTS_METADATA_PATH, normalizeProjectsMetadata } from "@/lib/project-metadata";
import { SKETCHFLOW_APP_URL } from "@/lib/config";
import { normalizeStackUser, requireGithubAccessToken, requireUser } from "@/server/auth";
import { getWorkspace } from "@/server/db/repositories";
import { getGithubOAuthScopes } from "@/server/env";
import {
	GithubApiError,
	getBranchHeadSha,
	readGithubFileText,
	validateGithubPathSegment,
} from "@/server/github";
import { jsonError, jsonOk, NotFoundError } from "@/server/http";
import { readPublicJson, readPublicText } from "@/server/public-github";

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

async function readOptionalText(input: {
	accessToken: string;
	owner: string;
	repo: string;
	ref: string;
	path: string;
}) {
	try {
		return await readGithubFileText(input);
	} catch (error) {
		if (error instanceof GithubApiError && error.status === 404) {
			return null;
		}

		throw error;
	}
}

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ workspaceId: string; projectId: string; sketchId: string }> },
) {
	try {
		const { workspaceId, projectId, sketchId } = await params;
		const projectSlug = validateGithubPathSegment(projectId);
		const sketchSlug = validateGithubPathSegment(sketchId);
		const user = normalizeStackUser(await requireUser());
		const workspace = await getWorkspace(user.id, workspaceId);

		if (!workspace) {
			throw new NotFoundError("Workspace not found");
		}

		if (workspace.visibility === "public") {
			const [workspaceFile, projectsMetadataFile, projectFile, sketchFile, notesFile] = await Promise.all([
				readPublicJson<unknown>({
					owner: workspace.repoOwner,
					repo: workspace.repoName,
					branch: workspace.defaultBranch,
					path: ".sketchflow/workspace.json",
				}),
				readPublicJson<unknown>({
					owner: workspace.repoOwner,
					repo: workspace.repoName,
					branch: workspace.defaultBranch,
					path: PROJECTS_METADATA_PATH,
				}),
				readPublicJson<unknown>({
					owner: workspace.repoOwner,
					repo: workspace.repoName,
					branch: workspace.defaultBranch,
					path: `projects/${projectSlug}/project.json`,
				}),
				readPublicJson<unknown>({
					owner: workspace.repoOwner,
					repo: workspace.repoName,
					branch: workspace.defaultBranch,
					path: `projects/${projectSlug}/sketches/${sketchSlug}.excalidraw.json`,
				}),
				readPublicText({
					owner: workspace.repoOwner,
					repo: workspace.repoName,
					branch: workspace.defaultBranch,
					path: `projects/${projectSlug}/docs/notes.md`,
				}),
			]);

			return jsonOk({
				workspace,
				projectSlug,
				sketchSlug,
				workspaceFile: workspaceFile ? { json: workspaceFile } : null,
				project: projectFile,
				projectsMetadata: normalizeProjectsMetadata(projectsMetadataFile),
				sketch: sketchFile ?? {
					type: "excalidraw",
					version: 2,
					source: SKETCHFLOW_APP_URL,
					elements: [],
					appState: {
						viewBackgroundColor: "#ffffff",
					},
					files: {},
				},
				notes: notesFile ?? "",
				files: {
					project: null,
					sketch: null,
					notes: null,
				},
			});
		}

		const scopes = getGithubOAuthScopes();
		const { accessToken } = await requireGithubAccessToken(scopes, request);
		const base = {
			accessToken,
			owner: workspace.repoOwner,
			repo: workspace.repoName,
			ref: workspace.defaultBranch,
		};
		const [latestCommitSha, workspaceFile, projectsMetadataFile, projectFile, sketchFile, notesFile] = await Promise.all([
			getBranchHeadSha(accessToken, workspace.repoOwner, workspace.repoName, workspace.defaultBranch),
			readOptionalJson({ ...base, path: ".sketchflow/workspace.json" }),
			readOptionalJson({ ...base, path: PROJECTS_METADATA_PATH }),
			readOptionalJson({ ...base, path: `projects/${projectSlug}/project.json` }),
			readOptionalJson({ ...base, path: `projects/${projectSlug}/sketches/${sketchSlug}.excalidraw.json` }),
			readOptionalText({ ...base, path: `projects/${projectSlug}/docs/notes.md` }),
		]);

		return jsonOk({
			workspace: {
				...workspace,
				latestCommitSha,
			},
			projectSlug,
			sketchSlug,
			workspaceFile,
			project: projectFile?.json ?? null,
			projectsMetadata: normalizeProjectsMetadata(projectsMetadataFile?.json),
			sketch: sketchFile?.json ?? {
				type: "excalidraw",
				version: 2,
				source: SKETCHFLOW_APP_URL,
				elements: [],
				appState: {
					viewBackgroundColor: "#ffffff",
				},
				files: {},
			},
			notes: notesFile?.content ?? "",
			files: {
				project: projectFile?.file ?? null,
				sketch: sketchFile?.file ?? null,
				notes: notesFile ?? null,
			},
		});
	} catch (error) {
		return jsonError(error);
	}
}
