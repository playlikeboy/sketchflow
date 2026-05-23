import "server-only";

import { stackServerApp } from "@/stack/server";

export class UnauthorizedError extends Error {
	constructor(message = "Authentication required") {
		super(message);
		this.name = "UnauthorizedError";
	}
}

export type GithubAccessTokenErrorCode = "github_not_connected" | "github_oauth_app_required" | "github_token_unavailable";

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

type StackUserLike = {
	id: string;
	primaryEmail?: string | null;
	displayName?: string | null;
	profileImageUrl?: string | null;
	listConnectedAccounts?: () => Promise<unknown[]>;
	getConnectedAccount?: (
		provider: string,
		options?: { scopes?: string[]; or?: "redirect" | "throw" | "return-null" },
	) => Promise<unknown>;
};

type OAuthConnectionLike = {
	id?: string;
	provider?: string;
	getAccessToken: (options?: { scopes?: string[] }) => Promise<
		| {
				status: "ok";
				data: { accessToken: string };
		  }
		| {
				status: "error";
				error: unknown;
		  }
		| {
				accessToken: string;
		  }
	>;
};

function errorMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}

	if (error && typeof error === "object") {
		if ("humanReadableMessage" in error && typeof error.humanReadableMessage === "string") {
			return error.humanReadableMessage;
		}

		if ("message" in error && typeof error.message === "string") {
			return error.message;
		}
	}

	return "";
}

function githubTokenError(
	error: unknown,
	fallback = "GitHub access token is unavailable for the requested scopes. Reconnect GitHub and approve repo, read:user, and user:email permissions. If this continues, verify the GitHub OAuth Client ID and Secret are saved under Stack Auth > Auth Methods > GitHub for this same Stack project.",
) {
	const message = errorMessage(error);

	if (message.toLowerCase().includes("shared oauth keys")) {
		return new GithubAccessTokenError(
			"github_oauth_app_required",
			"GitHub is connected through Stack Auth shared OAuth keys, which cannot provide access tokens. Add your own GitHub OAuth app credentials in the Stack dashboard, then reconnect GitHub.",
		);
	}

	return new GithubAccessTokenError("github_token_unavailable", message || fallback);
}

function isOAuthConnectionLike(account: unknown): account is OAuthConnectionLike {
	return Boolean(
		account &&
			typeof account === "object" &&
			"getAccessToken" in account &&
			typeof account.getAccessToken === "function",
	);
}

function isGithubConnection(account: OAuthConnectionLike) {
	return account.provider === "github" || account.id === "github";
}

async function getGithubConnection(user: StackUserLike, scopes: string[]) {
	if (user.listConnectedAccounts) {
		const accounts = await user.listConnectedAccounts();
		const githubAccount = accounts.find((account) => isOAuthConnectionLike(account) && isGithubConnection(account));

		if (isOAuthConnectionLike(githubAccount)) {
			return githubAccount;
		}
	}

	if (!user.getConnectedAccount) {
		return null;
	}

	return (await user.getConnectedAccount("github", {
		scopes,
		or: "return-null",
	})) as OAuthConnectionLike | null;
}

async function getAccessTokenFromConnection(account: OAuthConnectionLike, scopes: string[]) {
	const token = await account.getAccessToken({ scopes });

	if ("status" in token) {
		if (token.status === "ok") {
			return token.data.accessToken;
		}

		throw githubTokenError(token.error);
	}

	return token.accessToken;
}

export function normalizeStackUser(user: StackUserLike): SketchflowUser {
	return {
		id: user.id,
		primaryEmail: user.primaryEmail ?? null,
		displayName: user.displayName ?? null,
		profileImageUrl: user.profileImageUrl ?? null,
	};
}

export async function getOptionalUser() {
	const user = (await stackServerApp.getUser()) as StackUserLike | null;
	return user;
}

export async function requireUser() {
	const user = await getOptionalUser();

	if (!user) {
		throw new UnauthorizedError();
	}

	return user;
}

export async function requireGithubAccessToken(scopes: string[]) {
	const user = await requireUser();

	if (!user.listConnectedAccounts && !user.getConnectedAccount) {
		throw new UnauthorizedError("GitHub account is not connected");
	}

	let account: OAuthConnectionLike | null;
	try {
		account = await getGithubConnection(user, scopes);
	} catch (error) {
		throw githubTokenError(error, "GitHub account is not connected");
	}

	if (!account) {
		throw new GithubAccessTokenError("github_not_connected", "GitHub account is not connected");
	}

	let accessToken: string;
	try {
		accessToken = await getAccessTokenFromConnection(account, scopes);
	} catch (error) {
		if (error instanceof GithubAccessTokenError) {
			throw error;
		}
		throw githubTokenError(error);
	}

	return {
		accessToken,
		user: normalizeStackUser(user),
	};
}
