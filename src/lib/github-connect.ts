const DEFAULT_GITHUB_SCOPES = ["repo", "read:user", "user:email"];

type StackAppForGithubConnect = {
	getUser: (options: { or: "redirect" }) => Promise<unknown>;
};

type OAuthProviderForGithubConnect = {
	id?: string;
	type?: string;
	allowConnectedAccounts?: boolean;
	update?: (data: { allowConnectedAccounts?: boolean }) => Promise<unknown>;
};

type UserWithConnectedAccounts = {
	oauthProviders?: readonly OAuthProviderForGithubConnect[];
	linkConnectedAccount: (provider: string, options?: { scopes?: string[] }) => Promise<void>;
};

function hasGithubConnector(user: unknown): user is UserWithConnectedAccounts {
	if (!user || typeof user !== "object") {
		return false;
	}

	return (
		"linkConnectedAccount" in user &&
		typeof user.linkConnectedAccount === "function"
	);
}

function isGithubProvider(provider: OAuthProviderForGithubConnect) {
	return provider.id === "github" || provider.type === "github";
}

async function enableGithubConnectedAccountAccess(user: UserWithConnectedAccounts) {
	const provider = user.oauthProviders?.find(isGithubProvider);

	if (
		provider &&
		provider.allowConnectedAccounts === false &&
		typeof provider.update === "function"
	) {
		await provider.update({ allowConnectedAccounts: true });
	}
}

export async function connectGithubAccount(app: StackAppForGithubConnect, scopes = DEFAULT_GITHUB_SCOPES) {
	const user = await app.getUser({ or: "redirect" });

	if (!hasGithubConnector(user)) {
		throw new Error("Stack Auth user session cannot start GitHub account linking");
	}

	await enableGithubConnectedAccountAccess(user);
	await user.linkConnectedAccount("github", { scopes });
}
