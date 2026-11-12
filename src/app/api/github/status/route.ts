import {
	githubErrorCopy,
	isRepositoryScope,
	missingGithubScopes,
	type GithubErrorCode,
} from "@/lib/github-errors";
import { GithubAccessTokenError, requireGithubAccessToken } from "@/server/auth";
import { upsertGithubConnection, upsertUser } from "@/server/db/repositories";
import { getGithubOAuthScopes } from "@/server/env";
import { GithubApiError, getAuthenticatedGithubUserWithScopes } from "@/server/github";
import { jsonError, jsonOk } from "@/server/http";

type Disconnected = {
	reason: GithubErrorCode;
	retryAt?: string;
	missingScopes?: string[];
};

// The client depends on `connected: false` plus a `reason`; everything else explains it.
function disconnected({ reason, retryAt, missingScopes }: Disconnected) {
	return jsonOk({
		connected: false,
		reason,
		message: githubErrorCopy(reason, { retryAt }).message,
		scopes: getGithubOAuthScopes(),
		...(retryAt ? { retryAt } : {}),
		...(missingScopes ? { missingScopes } : {}),
	});
}

export async function GET(request: Request) {
	try {
		const scopes = getGithubOAuthScopes();
		const { accessToken, user, source } = await requireGithubAccessToken(request);
		const { githubUser, grantedScopes } = await getAuthenticatedGithubUserWithScopes(accessToken);

		await upsertUser(user);

		// The connection row is what ties a GitHub account to a Sketchflow user at sign-in, so
		// it is recorded only for the account that signed in through GitHub. A pasted personal
		// access token can belong to any account and must never create that link.
		if (source === "github-oauth") {
			await upsertGithubConnection(user.id, {
				githubLogin: githubUser.login,
				githubUserId: String(githubUser.id),
				scopes,
			});
		}

		// Only the sign-in token is held to the configured scopes, and only the ones that gate
		// repository access. A pasted token is the user's own choice of permissions, and
		// fine-grained tokens report no scopes at all (`grantedScopes` is null for those).
		const missingScopes =
			source === "github-oauth" ? missingGithubScopes(scopes.filter(isRepositoryScope), grantedScopes) : [];
		if (missingScopes.length > 0) {
			return disconnected({ reason: "github_missing_scope", missingScopes });
		}

		return jsonOk({
			connected: true,
			scopes,
			github: {
				login: githubUser.login,
				id: githubUser.id,
				avatarUrl: githubUser.avatar_url,
				htmlUrl: githubUser.html_url,
			},
			source,
		});
	} catch (error) {
		if (error instanceof GithubAccessTokenError) {
			return disconnected({ reason: error.code });
		}

		if (error instanceof GithubApiError) {
			return disconnected({ reason: error.code, retryAt: error.retryAt });
		}

		return jsonError(error);
	}
}
