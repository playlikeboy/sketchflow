import { getAuth } from "@/server/auth";
import { isAllowedAuthRoute } from "@/server/auth-routes";

// Better Auth owns sign-in, the GitHub OAuth callback, and sign-out under /api/auth/*.
// Only those routes are reachable; see src/server/auth-routes.ts for why the rest are not.
// The more specific /api/auth/me route is matched before this catch-all.
function handleAuthRequest(request: Request) {
	if (!isAllowedAuthRoute(request.method, new URL(request.url).pathname)) {
		return new Response("Not Found", { status: 404 });
	}

	return getAuth().handler(request);
}

export { handleAuthRequest as GET, handleAuthRequest as POST };
