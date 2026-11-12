import "server-only";

import { headers } from "next/headers";

import { SKETCHFLOW_APP_URL } from "@/lib/config";
import { createAuth, type SketchflowAuth } from "@/server/better-auth";
import { findUserIdByGithubUserId } from "@/server/db/repositories";
import { getGithubOAuthScopes, getOptionalEnv, getRequiredEnv } from "@/server/env";
import { chooseAppUserId } from "@/server/identity";

export class UnauthorizedError extends Error {
	constructor(message = "Authentication required") {
		super(message);
		this.name = "UnauthorizedError";
	}
}

export type GithubAccessTokenErrorCode = "github_not_connected" | "github_token_unavailable";

export class GithubAccessTokenError extends Error {
	constructor(
		readonly code: GithubAccessTokenErrorCode,
		message: string,
		readonly status = 409,
	) {
		super(message);
		this.name = "GithubAccessTokenError";
	}
}

export type SketchflowUser = {
	id: string;
	primaryEmail: string | null;
	displayName: string | null;
	profileImageUrl: string | null;
};

export type GithubAccessTokenSource = "github-oauth" | "local-token";

const LOCAL_GITHUB_TOKEN_HEADER = "x-sketchflow-github-token";
const RECONNECT_GITHUB_MESSAGE = "Reconnect GitHub to finish setting up your workspace.";
const USER_ID_CACHE_LIMIT = 500;

let authInstance: SketchflowAuth | null = null;

// Built on first use so a build that has no secrets in its environment can still import
// route modules, and so the Worker reads its bindings after they are populated.
export function getAuth() {
	if (!authInstance) {
		const isProduction = process.env.NODE_ENV === "production";

		authInstance = createAuth({
			secret: getRequiredEnv("BETTER_AUTH_SECRET"),
			baseURL: getOptionalEnv("BETTER_AUTH_URL") || (isProduction ? SKETCHFLOW_APP_URL : undefined),
			githubClientId: getRequiredEnv("GITHUB_CLIENT_ID"),
			githubClientSecret: getRequiredEnv("GITHUB_CLIENT_SECRET"),
			githubScopes: getGithubOAuthScopes(),
		});
	}

	return authInstance;
}

// A GitHub account maps to the same Sketchflow user id for good, so the answer is safe to
// keep for the life of the server instance.
const userIdByGithubUserId = new Map<string, string>();

async function resolveAppUserId(githubUserId: string) {
	const cached = userIdByGithubUserId.get(githubUserId);
	if (cached) {
		return cached;
	}

	const userId = chooseAppUserId(githubUserId, await findUserIdByGithubUserId(githubUserId));

	if (userIdByGithubUserId.size >= USER_ID_CACHE_LIMIT) {
		userIdByGithubUserId.clear();
	}
	userIdByGithubUserId.set(githubUserId, userId);

	return userId;
}

export async function getOptionalUser(): Promise<SketchflowUser | null> {
	const identity = await getAuth().api.getGithubIdentity({ headers: await headers() });

	if (!identity) {
		return null;
	}

	return {
		id: await resolveAppUserId(identity.githubUserId),
		primaryEmail: identity.email,
		displayName: identity.name,
		profileImageUrl: identity.image,
	};
}

export async function requireUser(): Promise<SketchflowUser> {
	const user = await getOptionalUser();

	if (!user) {
		throw new UnauthorizedError();
	}

	return user;
}

function getLocalGithubToken(request?: Request) {
	const token = request?.headers.get(LOCAL_GITHUB_TOKEN_HEADER)?.trim();
	return token || null;
}

export function hasLocalGithubToken(request?: Request) {
	return Boolean(getLocalGithubToken(request));
}

async function getOAuthGithubAccessToken() {
	try {
		const tokens = await getAuth().api.getAccessToken({
			body: { useAccountCookie: true },
			headers: await headers(),
		});

		return tokens.accessToken || null;
	} catch (error) {
		// Detail goes to the server log only; the browser gets a fixed reconnect message.
		console.error("Could not read the GitHub access token from the session", error);
		throw new GithubAccessTokenError("github_token_unavailable", RECONNECT_GITHUB_MESSAGE);
	}
}

/**
 * Returns a GitHub token for the signed-in user: a personal access token the browser sent
 * for this request if there is one, otherwise the OAuth token granted at sign-in.
 */
export async function requireGithubAccessToken(
	request?: Request,
): Promise<{ accessToken: string; user: SketchflowUser; source: GithubAccessTokenSource }> {
	const user = await requireUser();
	const localToken = getLocalGithubToken(request);

	if (localToken) {
		return { accessToken: localToken, user, source: "local-token" };
	}

	const accessToken = await getOAuthGithubAccessToken();

	if (!accessToken) {
		throw new GithubAccessTokenError("github_not_connected", "GitHub account is not connected");
	}

	return { accessToken, user, source: "github-oauth" };
}
