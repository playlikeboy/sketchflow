import { normalizeStackUser, requireGithubAccessToken, requireUser } from "@/server/auth";
import { getWorkspace } from "@/server/db/repositories";
import { getGithubOAuthScopes } from "@/server/env";
import { parseRepoJson, readGithubFileText, validateGithubPathSegment, validateProjectScopedPath } from "@/server/github";
import { BadRequestError, jsonError, jsonOk, NotFoundError } from "@/server/http";
import { isJsonObject } from "@/server/validation";

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ workspaceId: string; projectId: string; commitSha: string }> },
) {
	try {
		const { workspaceId, projectId: rawProjectId, commitSha } = await params;
		const projectId = validateGithubPathSegment(rawProjectId);
		if (!/^[0-9a-f]{7,40}$/i.test(commitSha)) {
			throw new BadRequestError("Expected a Git commit SHA");
		}
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

		const parsedProject = projectFile ? parseRepoJson(projectFile.content, projectFile.path) : null;
		const projectJson = isJsonObject(parsedProject) ? parsedProject : null;
		const docs = isJsonObject(projectJson?.docs) ? projectJson.docs : null;

		// 2. Identify the target sketch and notes paths at that commit (kept inside the project folder)
		const defaultSketchPath = projectJson?.defaultSketch
			? validateProjectScopedPath(projectId, projectJson.defaultSketch)
			: `projects/${projectId}/sketches/system-map.excalidraw.json`;
		const notesPath = docs?.notes
			? validateProjectScopedPath(projectId, docs.notes)
			: `projects/${projectId}/docs/notes.md`;

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
				path: notesPath,
			}).catch(() => null),
		]);

		return jsonOk({
			project: projectJson,
			sketch: sketchFile ? parseRepoJson(sketchFile.content, sketchFile.path) : null,
			notes: notesFile ? notesFile.content : "",
		});
	} catch (error) {
		return jsonError(error);
	}
}
