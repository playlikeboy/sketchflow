// Maps a signed-in GitHub account to the Sketchflow user id that owns workspace rows and
// scopes browser-local drafts.
//
// Accounts created before the move to Better Auth are keyed by their old auth-provider id.
// Those ids are kept as they are: the recorded GitHub connection says which GitHub account
// owns them, so signing in with that account lands on the same workspaces and drafts.
// Everyone else gets an id derived from the GitHub account, which never changes.

const GITHUB_USER_ID_PREFIX = "github_";
const GITHUB_ACCOUNT_ID_PATTERN = /^\d+$/;

function assertGithubAccountId(githubUserId: string) {
	if (!GITHUB_ACCOUNT_ID_PATTERN.test(githubUserId)) {
		throw new Error("Expected a numeric GitHub account id");
	}
}

export function githubDerivedUserId(githubUserId: string) {
	assertGithubAccountId(githubUserId);
	return `${GITHUB_USER_ID_PREFIX}${githubUserId}`;
}

/**
 * @param githubUserId the GitHub account that signed in
 * @param connectedUserId the user id recorded against that GitHub account, if any
 */
export function chooseAppUserId(githubUserId: string, connectedUserId: string | null) {
	const derivedUserId = githubDerivedUserId(githubUserId);

	if (!connectedUserId) {
		return derivedUserId;
	}

	// A derived id belongs to exactly one GitHub account. A connection row that points one
	// GitHub account at another account's derived id is never honoured.
	if (connectedUserId.startsWith(GITHUB_USER_ID_PREFIX) && connectedUserId !== derivedUserId) {
		return derivedUserId;
	}

	return connectedUserId;
}
