const DEFAULT_GITHUB_SCOPES = ["repo", "read:user", "user:email"];

type StackAppForGithubConnect = {
	getUser: (options: { or: "redirect" }) => Promise<unknown>;
};

type UserWithConnectedAccounts = {
	getOrLinkConnectedAccount: (provider: string, options?: { scopes?: string[] }) => Promise<unknown>;
};

function hasGithubConnector(user: unknown): user is UserWithConnectedAccounts {
	if (!user || typeof user !== "object") {
		return false;
	}

	return (
		"getOrLinkConnectedAccount" in user &&
		typeof user.getOrLinkConnectedAccount === "function"
	);
}

export async function connectGithubAccount(app: StackAppForGithubConnect, scopes = DEFAULT_GITHUB_SCOPES) {
	const user = await app.getUser({ or: "redirect" });

	if (!hasGithubConnector(user)) {
		throw new Error("Stack Auth user session cannot link connected accounts");
	}

	await user.getOrLinkConnectedAccount("github", { scopes });
}
