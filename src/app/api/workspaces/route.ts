export const dynamic = "force-dynamic";

import { requireGithubAccessToken, requireUser } from "@/server/auth";
import { getGithubRepository, validateGithubBranch, validateGithubPathSegment, validateGithubRepoName } from "@/server/github";
import { upsertUser } from "@/server/db/repositories";
import { listWorkspaces, upsertWorkspace, type WorkspaceVisibility } from "@/server/db/repositories";
import { BadRequestError, jsonError, jsonOk, assertSameOrigin, assertRateLimit } from "@/server/http";
import { RATE_LIMITS } from "@/server/rate-limit";
import { isJsonObject, optionalString, requiredString } from "@/server/validation";

function parseVisibility(value: string | undefined): WorkspaceVisibility {
	if (!value) {
		return "public";
	}

	if (value === "private" || value === "public") {
		return value;
	}

	throw new BadRequestError('Expected "visibility" to be "private" or "public"');
}

export async function GET() {
	try {
		const user = await requireUser();
		await upsertUser(user);

		const workspaces = await listWorkspaces(user.id);

		return jsonOk({ workspaces });
	} catch (error) {
		return jsonError(error);
	}
}

export async function POST(request: Request) {
	try {
		assertSameOrigin(request);
		const user = await requireUser();
		await upsertUser(user);

		assertRateLimit("workspace-register", user.id, RATE_LIMITS.projectWrite);

		const body = await request.json();
		if (!isJsonObject(body)) {
			throw new BadRequestError("Expected a JSON object body");
		}

		const repoOwner = validateGithubPathSegment(requiredString(body, "repoOwner"));
		const repoName = validateGithubRepoName(requiredString(body, "repoName"));
		const requestedBranch = optionalString(body, "defaultBranch");
		const requestedVisibility = optionalString(body, "visibility");
		const latestCommitSha = optionalString(body, "latestCommitSha");
		if (latestCommitSha && !/^[0-9a-f]{40}$/i.test(latestCommitSha)) {
			throw new BadRequestError('Expected "latestCommitSha" to be a 40-character Git SHA');
		}
		if (requestedVisibility) {
			parseVisibility(requestedVisibility);
		}

		// Only register repositories the caller can actually reach, and trust GitHub (not the
		// request body) for visibility and the default branch.
		const { accessToken } = await requireGithubAccessToken(request);
		const repository = await getGithubRepository(accessToken, repoOwner, repoName);

		const workspace = await upsertWorkspace(user.id, {
			repoOwner: repository.owner.login,
			repoName: repository.name,
			defaultBranch: requestedBranch ? validateGithubBranch(requestedBranch) : repository.default_branch,
			visibility: repository.private ? "private" : "public",
			latestCommitSha: latestCommitSha ?? null,
		});

		return jsonOk({ workspace }, { status: 201 });
	} catch (error) {
		return jsonError(error);
	}
}
