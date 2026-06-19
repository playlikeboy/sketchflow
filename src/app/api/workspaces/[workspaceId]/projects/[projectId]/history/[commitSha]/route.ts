import { normalizeStackUser, requireGithubAccessToken, requireUser } from "@/server/auth";
import { getWorkspace } from "@/server/db/repositories";
import { getGithubOAuthScopes } from "@/server/env";
import { readGithubFileText } from "@/server/github";
import { jsonError, jsonOk, NotFoundError } from "@/server/http";

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ workspaceId: string; projectId: string; commitSha: string }> },
) {
	try {
		const { workspaceId, projectId, commitSha } = await params;
		const user = normalizeStackUser(await requireUser());
		const workspace = await getWorkspace(user.id, workspaceId);

		if (!workspace) {
			throw new NotFoundError("Workspace not found");
		}

		const scopes = getGithubOAuthScopes();
		const { accessToken } = await requireGithubAccessToken(scopes, request);

		// 1. Read project metadata configuration at the specific commit
		const projectFile = await readGithubFileText({
			accessToken,
			owner: workspace.repoOwner,
			repo: workspace.repoName,
			ref: commitSha,
			path: `projects/${projectId}/project.json`,
		}).catch(() => null);

		const projectJson = projectFile ? JSON.parse(projectFile.content) : null;
		
		// 2. Identify the target sketch path at that commit
		const defaultSketchPath = projectJson?.defaultSketch || `projects/${projectId}/sketches/system-map.excalidraw.json`;

		// 3. Retrieve target sketch elements and documentation notes at the specific commit in parallel
		const [sketchFile, notesFile] = await Promise.all([
			readGithubFileText({
				accessToken,
				owner: workspace.repoOwner,
				repo: workspace.repoName,
				ref: commitSha,
				path: defaultSketchPath,
			}).catch(() => null),
			readGithubFileText({
				accessToken,
				owner: workspace.repoOwner,
				repo: workspace.repoName,
				ref: commitSha,
				path: projectJson?.docs?.notes || `projects/${projectId}/docs/notes.md`,
			}).catch(() => null),
		]);

		return jsonOk({
			project: projectJson,
			sketch: sketchFile ? JSON.parse(sketchFile.content) : null,
			notes: notesFile ? notesFile.content : "",
		});
	} catch (error) {
		return jsonError(error);
	}
}
