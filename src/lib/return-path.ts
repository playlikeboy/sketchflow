// Where to send someone after they sign in. The value arrives in a query string, so it is
// only ever honoured when it is a path on this site.

export const SIGN_IN_PATH = "/sign-in";
export const DEFAULT_RETURN_PATH = "/app";

// Rejects control characters and backslashes, which browsers can normalize into a
// different origin (for example "/\evil.example").
const UNSAFE_PATH_CHARACTERS = /[\u0000-\u001f\u007f\\]/;

export function safeReturnPath(value: string | null | undefined, fallback = DEFAULT_RETURN_PATH) {
	if (!value || !value.startsWith("/") || value.startsWith("//") || UNSAFE_PATH_CHARACTERS.test(value)) {
		return fallback;
	}

	// Returning to the sign-in page itself would loop.
	if (value === SIGN_IN_PATH || value.startsWith(`${SIGN_IN_PATH}?`) || value.startsWith(`${SIGN_IN_PATH}/`)) {
		return fallback;
	}

	return value;
}

export function signInPath(returnPath?: string | null) {
	const next = safeReturnPath(returnPath);
	return next === DEFAULT_RETURN_PATH ? SIGN_IN_PATH : `${SIGN_IN_PATH}?next=${encodeURIComponent(next)}`;
}
