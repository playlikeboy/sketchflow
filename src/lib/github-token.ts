const STORAGE_KEY = "sketchflow:github-token";
export const GITHUB_TOKEN_CHANGED_EVENT = "sketchflow:github-token-changed";

export const GITHUB_TOKEN_SETUP_URL =
	"https://github.com/settings/tokens/new?description=Sketchflow%20local%20sync%20token&scopes=repo,read:user,user:email";

function canUseStorage() {
	return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getStoredGithubToken() {
	if (!canUseStorage()) {
		return null;
	}

	const token = window.localStorage.getItem(STORAGE_KEY)?.trim();
	return token || null;
}

function emitGithubTokenChange() {
	if (typeof window !== "undefined") {
		window.dispatchEvent(new Event(GITHUB_TOKEN_CHANGED_EVENT));
	}
}

export function getStoredGithubTokenFingerprint() {
	const token = getStoredGithubToken();

	if (!token) {
		return "none";
	}

	return `${token.length}:${token.slice(0, 4)}:${token.slice(-4)}`;
}

export function setStoredGithubToken(token: string) {
	if (!canUseStorage()) {
		return;
	}

	const nextToken = token.trim();
	if (nextToken) {
		window.localStorage.setItem(STORAGE_KEY, nextToken);
	} else {
		window.localStorage.removeItem(STORAGE_KEY);
	}

	emitGithubTokenChange();
}

export function clearStoredGithubToken() {
	if (canUseStorage()) {
		window.localStorage.removeItem(STORAGE_KEY);
		emitGithubTokenChange();
	}
}

export function hasStoredGithubToken() {
	return Boolean(getStoredGithubToken());
}
