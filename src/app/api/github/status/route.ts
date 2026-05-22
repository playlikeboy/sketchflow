import { GithubAccessTokenError, requireGithubAccessToken } from "@/server/auth";
import { upsertGithubConnection, upsertUser } from "@/server/db/repositories";
import { getGithubOAuthScopes } from "@/server/env";
import { getAuthenticatedGithubUser } from "@/server/github";
import { jsonError, jsonOk } from "@/server/http";

export async function GET() {
	try {
		const scopes = getGithubOAuthScopes();
		const { accessToken, user } = await requireGithubAccessToken(scopes);
		const githubUser = await getAuthenticatedGithubUser(accessToken);

		await upsertUser(user);
		await upsertGithubConnection(user.id, {
			githubLogin: githubUser.login,
			githubUserId: String(githubUser.id),
			scopes,
		});

		return jsonOk({
			connected: true,
			scopes,
			github: {
				login: githubUser.login,
				id: githubUser.id,
				avatarUrl: githubUser.avatar_url,
				htmlUrl: githubUser.html_url,
			},
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

		return jsonError(error);
	}
}
