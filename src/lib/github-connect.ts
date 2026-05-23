const DEFAULT_GITHUB_SCOPES = ["repo", "read:user", "user:email"];

type StackAppForGithubConnect = {
	getUser: (options: { or: "redirect" }) => Promise<unknown>;
};

type UserWithConnectedAccounts = {
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

export async function connectGithubAccount(app: StackAppForGithubConnect, scopes = DEFAULT_GITHUB_SCOPES) {
	const user = await app.getUser({ or: "redirect" });

	if (!hasGithubConnector(user)) {
		throw new Error("Stack Auth user session cannot start GitHub account linking");
	}

	await user.linkConnectedAccount("github", { scopes });
}
