import { GithubAccessTokenError, requireGithubAccessToken } from "@/server/auth";
import { upsertGithubConnection, upsertUser } from "@/server/db/repositories";
import { getGithubOAuthScopes } from "@/server/env";
import { GithubApiError, getAuthenticatedGithubUser } from "@/server/github";
import { jsonError, jsonOk } from "@/server/http";

export async function GET(request: Request) {
	try {
		const scopes = getGithubOAuthScopes();
		const { accessToken, user, source } = await requireGithubAccessToken(request);
		const githubUser = await getAuthenticatedGithubUser(accessToken);

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
			return jsonOk({
				connected: false,
				reason: error.code,
				message: error.message,
				scopes: getGithubOAuthScopes(),
			});
		}

		if (error instanceof GithubApiError) {
			return jsonOk({
				connected: false,
				reason: "github_token_unavailable",
				message: "Refresh GitHub access or paste a local token with repository access.",
				scopes: getGithubOAuthScopes(),
			});
		}

		return jsonError(error);
	}
}
