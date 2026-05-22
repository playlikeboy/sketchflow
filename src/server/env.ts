export function getRequiredEnv(name: string) {
	const value = process.env[name];

	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}

	return value;
}

export function getOptionalEnv(name: string, fallback = "") {
	return process.env[name] || fallback;
}

export function getGithubOAuthScopes() {
	return getOptionalEnv("GITHUB_OAUTH_SCOPES", "repo,read:user,user:email")
		.split(",")
		.map((scope) => scope.trim())
		.filter(Boolean);
}
