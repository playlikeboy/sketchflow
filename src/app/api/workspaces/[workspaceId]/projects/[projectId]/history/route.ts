import { requireGithubAccessToken, requireUser } from "@/server/auth";
import { getWorkspace } from "@/server/db/repositories";
import { getPathCommits, validateGithubPathSegment } from "@/server/github";
import { jsonError, jsonOk, NotFoundError } from "@/server/http";

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ workspaceId: string; projectId: string }> },
) {
	try {
		const { workspaceId, projectId: rawProjectId } = await params;
		const projectId = validateGithubPathSegment(rawProjectId);
		const user = await requireUser();
		const workspace = await getWorkspace(user.id, workspaceId);

		if (!workspace) {
			throw new NotFoundError("Workspace not found");
		}

		const { accessToken } = await requireGithubAccessToken(request);

		const commits = await getPathCommits({
			accessToken,
			owner: workspace.repoOwner,
			repo: workspace.repoName,
			path: `projects/${projectId}`,
		});

		const formattedCommits = commits.map((item: any) => ({
			sha: item.sha,
			message: item.commit?.message || "No commit message",
			authorName: item.commit?.author?.name || item.author?.login || "Unknown Author",
			authorDate: item.commit?.author?.date || new Date().toISOString(),
			htmlUrl: item.html_url || "",
		}));

		return jsonOk({ commits: formattedCommits });
	} catch (error) {
		return jsonError(error);
	}
}
