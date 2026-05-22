import "server-only";

import { stackServerApp } from "@/stack/server";

export class UnauthorizedError extends Error {
	constructor(message = "Authentication required") {
		super(message);
		this.name = "UnauthorizedError";
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
	getConnectedAccount?: (
		provider: string,
		options?: { scopes?: string[]; or?: "redirect" | "throw" | "return-null" },
	) => Promise<unknown>;
};

type OAuthConnectionLike = {
	getAccessToken: (options?: { scopes?: string[] }) => Promise<
		| {
				status: "ok";
				data: { accessToken: string };
		  }
		| {
				status: "error";
				error: unknown;
		  }
	>;
};

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

	if (!user.getConnectedAccount) {
		throw new UnauthorizedError("GitHub account is not connected");
	}

	const account = (await user.getConnectedAccount("github", {
		scopes,
		or: "return-null",
	})) as OAuthConnectionLike | null;

	if (!account) {
		throw new UnauthorizedError("GitHub account is not connected");
	}

	const token = await account.getAccessToken({ scopes });

	if (token.status !== "ok") {
		throw new UnauthorizedError("GitHub access token is unavailable for the requested scopes");
	}

	return {
		accessToken: token.data.accessToken,
		user: normalizeStackUser(user),
	};
}
