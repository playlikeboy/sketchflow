// Better Auth registers many HTTP endpoints by default, including ones that return the
// signed-in user's GitHub access token as JSON. The browser only ever needs to start
// sign-in, finish the OAuth callback, and sign out, so everything else is refused before it
// reaches Better Auth. Server code reads the session and token through `auth.api` instead.

export const AUTH_BASE_PATH = "/api/auth";

const ALLOWED_AUTH_ROUTES: ReadonlySet<string> = new Set([
	"POST /sign-in/social",
	"GET /callback/github",
	"POST /sign-out",
	"GET /error",
]);

export function isAllowedAuthRoute(method: string, pathname: string) {
	if (!pathname.startsWith(`${AUTH_BASE_PATH}/`)) {
		return false;
	}

	const route = pathname.slice(AUTH_BASE_PATH.length).replace(/\/+$/, "");
	return ALLOWED_AUTH_ROUTES.has(`${method.toUpperCase()} ${route}`);
}
