import { afterEach, beforeEach, expect, test } from "bun:test";

import { createAuth } from "../src/server/better-auth";

const APP_ORIGIN = "http://localhost:3000";
const GITHUB_ACCOUNT_ID = 4242;
const GITHUB_ACCESS_TOKEN = "gho_test_access_token";

const realFetch = globalThis.fetch;
let githubRequests: string[] = [];

function jsonResponse(body: unknown) {
	return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}

// Stands in for github.com during the OAuth code exchange and profile lookup.
function fakeGithub(input: RequestInfo | URL): Promise<Response> {
	const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
	githubRequests.push(url);

	if (url === "https://github.com/login/oauth/access_token") {
		return Promise.resolve(
			jsonResponse({ access_token: GITHUB_ACCESS_TOKEN, token_type: "bearer", scope: "read:user,repo,user:email" }),
		);
	}

	if (url === "https://api.github.com/user") {
		return Promise.resolve(
			jsonResponse({
				id: GITHUB_ACCOUNT_ID,
				login: "octocat",
				name: "Mona Octocat",
				email: null,
				avatar_url: "https://avatars.githubusercontent.com/u/4242",
			}),
		);
	}

	if (url === "https://api.github.com/user/emails") {
		return Promise.resolve(jsonResponse([{ email: "mona@example.com", primary: true, verified: true }]));
	}

	return Promise.reject(new Error(`Unexpected outbound request in test: ${url}`));
}

beforeEach(() => {
	githubRequests = [];
	globalThis.fetch = fakeGithub as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = realFetch;
});

function newAuth(githubScopes = ["repo", "read:user", "user:email"]) {
	return createAuth({
		secret: "test-secret-that-is-long-enough-for-better-auth-0123456789",
		baseURL: APP_ORIGIN,
		githubClientId: "test-client-id",
		githubClientSecret: "test-client-secret",
		githubScopes,
	});
}

// Folds Set-Cookie headers into a Cookie header the way a browser would.
function collectCookies(response: Response, jar = new Map<string, string>()) {
	for (const entry of response.headers.getSetCookie()) {
		const [pair, ...attributes] = entry.split(";");
		const separator = pair.indexOf("=");
		const name = pair.slice(0, separator).trim();
		const value = pair.slice(separator + 1).trim();
		const expired = attributes.some((attribute) => attribute.trim().toLowerCase() === "max-age=0");

		if (expired || !value) {
			jar.delete(name);
		} else {
			jar.set(name, value);
		}
	}

	return jar;
}

function cookieHeader(jar: Map<string, string>) {
	return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function startSignIn(auth: ReturnType<typeof newAuth>, callbackURL = "/app") {
	const response = await auth.handler(
		new Request(`${APP_ORIGIN}/api/auth/sign-in/social`, {
			method: "POST",
			headers: { "content-type": "application/json", origin: APP_ORIGIN },
			body: JSON.stringify({ provider: "github", callbackURL }),
		}),
	);
	const body = (await response.json()) as { url: string };

	return { response, authorizeUrl: new URL(body.url), jar: collectCookies(response) };
}

async function signIn(auth: ReturnType<typeof newAuth>, callbackURL = "/app") {
	const { authorizeUrl, jar } = await startSignIn(auth, callbackURL);
	const state = authorizeUrl.searchParams.get("state") as string;
	const callback = await auth.handler(
		new Request(`${APP_ORIGIN}/api/auth/callback/github?code=test-code&state=${encodeURIComponent(state)}`, {
			headers: { cookie: cookieHeader(jar) },
		}),
	);

	return { callback, jar: collectCookies(callback, jar) };
}

test("sign-in sends the browser to GitHub asking for repository access in one step", async () => {
	const { response, authorizeUrl } = await startSignIn(newAuth());

	expect(response.status).toBe(200);
	expect(authorizeUrl.origin + authorizeUrl.pathname).toBe("https://github.com/login/oauth/authorize");
	expect(authorizeUrl.searchParams.get("client_id")).toBe("test-client-id");
	expect(authorizeUrl.searchParams.get("redirect_uri")).toBe(`${APP_ORIGIN}/api/auth/callback/github`);

	const scopes = (authorizeUrl.searchParams.get("scope") as string).split(/[ ,]+/).sort();
	expect(scopes).toEqual(["read:user", "repo", "user:email"]);
});

test("the GitHub callback signs the user in and returns them to where they started", async () => {
	const { callback, jar } = await signIn(newAuth(), "/app/workspace");

	expect(callback.status).toBe(302);
	expect(new URL(callback.headers.get("location") as string, APP_ORIGIN).href).toBe(`${APP_ORIGIN}/app/workspace`);
	expect([...jar.keys()].some((name) => name.endsWith("session_token"))).toBe(true);
	expect(githubRequests).toContain("https://github.com/login/oauth/access_token");
});

test("a signed-in request resolves to the GitHub account that signed in", async () => {
	const auth = newAuth();
	const { jar } = await signIn(auth);

	const identity = await auth.api.getGithubIdentity({ headers: new Headers({ cookie: cookieHeader(jar) }) });

	expect(identity).toEqual({
		githubUserId: String(GITHUB_ACCOUNT_ID),
		email: "mona@example.com",
		name: "Mona Octocat",
		image: "https://avatars.githubusercontent.com/u/4242",
	});
});

test("the GitHub access token is available to the server from the session cookies alone", async () => {
	const auth = newAuth();
	const { jar } = await signIn(auth);

	// A second instance shares nothing in memory with the first, like another server isolate.
	const otherIsolate = newAuth();
	const headers = new Headers({ cookie: cookieHeader(jar) });
	const tokens = await otherIsolate.api.getAccessToken({ body: { useAccountCookie: true }, headers });
	const identity = await otherIsolate.api.getGithubIdentity({ headers });

	expect(tokens.accessToken).toBe(GITHUB_ACCESS_TOKEN);
	expect(identity?.githubUserId).toBe(String(GITHUB_ACCOUNT_ID));
});

test("session cookies are HttpOnly and never expose the GitHub token in clear text", async () => {
	const { callback } = await signIn(newAuth());
	const setCookies = callback.headers.getSetCookie();
	const authCookies = setCookies.filter((entry) => /session_token|session_data|account_data/.test(entry));

	expect(authCookies.length).toBeGreaterThanOrEqual(3);
	for (const entry of authCookies) {
		expect(entry.toLowerCase()).toContain("httponly");
		expect(entry.toLowerCase()).toContain("samesite=lax");
		expect(entry).not.toContain(GITHUB_ACCESS_TOKEN);
	}
});

test("a request without session cookies is not signed in", async () => {
	const auth = newAuth();

	expect(await auth.api.getGithubIdentity({ headers: new Headers() })).toBeNull();
});

test("a forged account cookie does not sign anyone in", async () => {
	const auth = newAuth();
	const { jar } = await signIn(auth);
	const accountCookieName = [...jar.keys()].find((name) => name.includes("account_data")) as string;
	jar.set(accountCookieName, "forged-value");

	expect(await auth.api.getGithubIdentity({ headers: new Headers({ cookie: cookieHeader(jar) }) })).toBeNull();
});

test("the identity lookup has no HTTP route", async () => {
	const auth = newAuth();
	const { jar } = await signIn(auth);

	for (const path of ["/api/auth/get-github-identity", "/api/auth/sketchflow-github-identity"]) {
		const response = await auth.handler(new Request(`${APP_ORIGIN}${path}`, { headers: { cookie: cookieHeader(jar) } }));
		expect(response.status).toBe(404);
	}
});

test("signing out clears the session so the cookies stop working", async () => {
	const auth = newAuth();
	const { jar } = await signIn(auth);

	const response = await auth.handler(
		new Request(`${APP_ORIGIN}/api/auth/sign-out`, {
			method: "POST",
			headers: { cookie: cookieHeader(jar), origin: APP_ORIGIN, "content-type": "application/json" },
			body: "{}",
		}),
	);
	const afterSignOut = collectCookies(response, jar);

	expect(response.status).toBe(200);
	expect(await auth.api.getGithubIdentity({ headers: new Headers({ cookie: cookieHeader(afterSignOut) }) })).toBeNull();
});

test("a callback with a state the browser never started is rejected", async () => {
	const auth = newAuth();
	const response = await auth.handler(new Request(`${APP_ORIGIN}/api/auth/callback/github?code=test-code&state=made-up`));

	expect(response.status).toBe(302);
	expect(response.headers.get("location")).toContain("/sign-in");
	expect(response.headers.getSetCookie().some((entry) => entry.includes("session_token=") && !entry.includes("Max-Age=0"))).toBe(false);
});
