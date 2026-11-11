import { requireGithubAccessToken } from "@/server/auth";
import { getWorkspace, recordSyncEvent, updateWorkspaceCommit } from "@/server/db/repositories";
import { getGithubOAuthScopes } from "@/server/env";
import { createCommitOnBranch, jsDelivrBaseUrl, validateGithubFileChange, type GithubFileChange } from "@/server/github";
import { BadRequestError, jsonError, jsonOk, NotFoundError, assertSameOrigin, assertRateLimit } from "@/server/http";
import { RATE_LIMITS } from "@/server/rate-limit";
import { isJsonObject, optionalString } from "@/server/validation";

function parseFiles(value: unknown) {
	if (!Array.isArray(value)) {
		throw new BadRequestError('Expected "files" to be an array');
	}

	return value.map((file) => {
		if (!isJsonObject(file) || typeof file.path !== "string" || typeof file.content !== "string") {
			throw new BadRequestError('Each file must include string "path" and "content" fields');
		}

		return validateGithubFileChange({
			path: file.path,
			content: file.content,
		});
	}) satisfies GithubFileChange[];
}

export async function POST(request: Request, { params }: { params: Promise<{ workspaceId: string }> }) {
	try {
		assertSameOrigin(request);
		const { workspaceId } = await params;
		const scopes = getGithubOAuthScopes();
		const { accessToken, user } = await requireGithubAccessToken(scopes, request);
		assertRateLimit("commit", user.id, RATE_LIMITS.commit);
		const workspace = await getWorkspace(user.id, workspaceId);

		if (!workspace) {
			throw new NotFoundError("Workspace not found");
		}

		const body = await request.json();
		if (!isJsonObject(body)) {
			throw new BadRequestError("Expected a JSON object body");
		}

		const files = parseFiles(body.files);
		const message = optionalString(body, "message") || "Update Sketchflow workspace";
		const expectedHeadSha = optionalString(body, "expectedHeadSha");
		if (expectedHeadSha && !/^[0-9a-f]{40}$/i.test(expectedHeadSha)) {
			throw new BadRequestError('Expected "expectedHeadSha" to be a 40-character Git SHA');
		}
		const commit = await createCommitOnBranch({
			accessToken,
			owner: workspace.repoOwner,
			repo: workspace.repoName,
			branch: workspace.defaultBranch,
			message,
			files,
			expectedHeadSha,
		});

		await updateWorkspaceCommit(workspace.id, commit.sha);
		await recordSyncEvent({
			workspaceId: workspace.id,
			stackUserId: user.id,
			eventType: "workspace_commit",
			commitSha: commit.sha,
			message,
			metadata: {
				files: commit.files,
			},
		});

		return jsonOk({
			commit,
			cdnBaseUrl: jsDelivrBaseUrl(workspace.repoOwner, workspace.repoName, commit.sha),
		});
	} catch (error) {
		return jsonError(error);
	}
}
