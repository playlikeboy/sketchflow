import { normalizeStackUser, requireGithubAccessToken, requireUser } from "@/server/auth";
import { getWorkspace, recordSyncEvent, updateWorkspaceCommit } from "@/server/db/repositories";
import { getGithubOAuthScopes } from "@/server/env";
import { createCommitOnBranch, getBranchHeadSha, readGithubFileText } from "@/server/github";
import { BadRequestError, jsonError, jsonOk, NotFoundError } from "@/server/http";
import {
	PROJECTS_METADATA_PATH,
	buildProjectsMetadata,
	normalizeProjectsMetadata,
	projectFromProjectJson,
} from "@/lib/project-metadata";
import { isJsonObject, requiredString } from "@/server/validation";

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ workspaceId: string; projectId: string }> },
) {
	try {
		const { workspaceId, projectId } = await params;
		const user = normalizeStackUser(await requireUser());
		const workspace = await getWorkspace(user.id, workspaceId);

		if (!workspace) {
			throw new NotFoundError("Workspace not found");
		}

		const body = await request.json().catch(() => ({}));
		if (!isJsonObject(body)) {
			throw new BadRequestError("Expected a JSON object body");
		}

		const sourceCommitSha = requiredString(body, "sourceCommitSha");

		const scopes = getGithubOAuthScopes();
		const { accessToken } = await requireGithubAccessToken(scopes, request);

		// 1. Fetch project config details from the target historical commit
		const projectFileText = await readGithubFileText({
			accessToken,
			owner: workspace.repoOwner,
			repo: workspace.repoName,
			ref: sourceCommitSha,
			path: `projects/${projectId}/project.json`,
		});

		const projectJson = JSON.parse(projectFileText.content);
		const defaultSketchPath = projectJson.defaultSketch || `projects/${projectId}/sketches/system-map.excalidraw.json`;
		const notesPath = projectJson.docs?.notes || `projects/${projectId}/docs/notes.md`;

		// 2. Fetch targeted sketch shapes and doc files from the target historical commit in parallel
		const [sketchFileText, notesFileText] = await Promise.all([
			readGithubFileText({
				accessToken,
				owner: workspace.repoOwner,
				repo: workspace.repoName,
				ref: sourceCommitSha,
				path: defaultSketchPath,
			}),
			readGithubFileText({
				accessToken,
				owner: workspace.repoOwner,
				repo: workspace.repoName,
				ref: sourceCommitSha,
				path: notesPath,
			}),
		]);

		// 3. Fetch latest HEAD ref of the branch
		const currentHeadSha = await getBranchHeadSha(
			accessToken,
			workspace.repoOwner,
			workspace.repoName,
			workspace.defaultBranch,
		);

		// 4. Fetch current projects metadata index from branch head
		const currentMetadataFile = await readGithubFileText({
			accessToken,
			owner: workspace.repoOwner,
			repo: workspace.repoName,
			ref: currentHeadSha,
			path: PROJECTS_METADATA_PATH,
		}).catch(() => null);

		const currentMetadata = normalizeProjectsMetadata(currentMetadataFile ? JSON.parse(currentMetadataFile.content) : null);
		
		const restoredProject = projectFromProjectJson({
			projectId,
			projectJson,
			fallbackVisibility: workspace.visibility,
		});

		const updatedMetadata = buildProjectsMetadata({
			projects: [
				restoredProject,
				...(currentMetadata?.projects ?? []).filter((p) => p.id !== projectId),
			],
			workspace: {
				owner: workspace.repoOwner,
				repo: workspace.repoName,
				defaultBranch: workspace.defaultBranch,
			},
		});

		// 5. Build trees & commit the restored files back onto the branch head
		const commitResult = await createCommitOnBranch({
			accessToken,
			owner: workspace.repoOwner,
			repo: workspace.repoName,
			branch: workspace.defaultBranch,
			message: `Restore project ${projectId} from commit ${sourceCommitSha.slice(0, 7)}`,
			files: [
				{
					path: `projects/${projectId}/project.json`,
					content: projectFileText.content,
				},
				{
					path: defaultSketchPath,
					content: sketchFileText.content,
				},
				{
					path: notesPath,
					content: notesFileText.content,
				},
				{
					path: PROJECTS_METADATA_PATH,
					content: `${JSON.stringify(updatedMetadata, null, 2)}\n`,
				},
			],
		});

		await updateWorkspaceCommit(workspace.id, commitResult.sha);
		await recordSyncEvent({
			workspaceId: workspace.id,
			stackUserId: user.id,
			eventType: "project_restore",
			commitSha: commitResult.sha,
			message: `Restore project ${projectId} from commit ${sourceCommitSha.slice(0, 7)}`,
			metadata: {
				projectSlug: projectId,
				sourceCommitSha,
				restoredCommitSha: commitResult.sha,
			},
		});

		return jsonOk({ commit: commitResult });
	} catch (error) {
		return jsonError(error);
	}
}
