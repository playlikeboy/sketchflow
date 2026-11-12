import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
import { getAccountCookie } from "better-auth/cookies";

// Better Auth runs without a database here. The session and the GitHub OAuth account
// (including its access token) live in encrypted, HttpOnly cookies, so no token or
// session row is ever written to Postgres.

export const GITHUB_PROVIDER_ID = "github";

// Better Auth always requests these for GitHub; listing them again would duplicate them.
const GITHUB_DEFAULT_SCOPES = ["read:user", "user:email"];

const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 30;

export type GithubIdentity = {
	githubUserId: string;
	email: string | null;
	name: string | null;
	image: string | null;
};

/**
 * Reads who is signed in from the session cookie and which GitHub account they proved
 * control of from the account cookie. Both cookies are written only by the OAuth callback.
 * Server-only: it is callable through `auth.api` and has no HTTP route.
 */
function githubIdentityPlugin() {
	return {
		id: "sketchflow-github-identity",
		endpoints: {
			getGithubIdentity: createAuthEndpoint.serverOnly(
				{ method: "GET", requireHeaders: true },
				async (ctx): Promise<GithubIdentity | null> => {
					const session = await getSessionFromCtx(ctx);
					if (!session) {
						return null;
					}

					// Without a database the two cookies are not bound to each other by Better
					// Auth, so require that both were written for the same sign-in.
					const account = await getAccountCookie(ctx);
					if (
						!account ||
						account.providerId !== GITHUB_PROVIDER_ID ||
						!account.accountId ||
						account.userId !== session.user.id
					) {
						return null;
					}

					return {
						githubUserId: String(account.accountId),
						email: session.user.email || null,
						name: session.user.name || null,
						image: session.user.image ?? null,
					};
				},
			),
		},
	} satisfies BetterAuthPlugin;
}

export type SketchflowAuthConfig = {
	secret: string;
	/** Public origin of the app. When omitted, Better Auth derives it from the request. */
	baseURL?: string;
	githubClientId: string;
	githubClientSecret: string;
	githubScopes: string[];
};

export function createAuth(config: SketchflowAuthConfig) {
	return betterAuth({
		appName: "Sketchflow",
		baseURL: config.baseURL,
		secret: config.secret,
		socialProviders: {
			github: {
				clientId: config.githubClientId,
				clientSecret: config.githubClientSecret,
				scope: config.githubScopes.filter((scope) => !GITHUB_DEFAULT_SCOPES.includes(scope)),
			},
		},
		session: {
			expiresIn: SESSION_LIFETIME_SECONDS,
		},
		advanced: {
			ipAddress: {
				// Set by Cloudflare's edge and not spoofable by the client.
				ipAddressHeaders: ["cf-connecting-ip"],
			},
		},
		onAPIError: {
			errorURL: "/sign-in",
		},
		telemetry: {
			enabled: false,
		},
		plugins: [githubIdentityPlugin()],
	});
}

export type SketchflowAuth = ReturnType<typeof createAuth>;
