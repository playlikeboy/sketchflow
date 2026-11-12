import { beforeEach, describe, expect, test } from "bun:test";

import { installMocks, resetState, state } from "./api/helpers";

// The handlers and the GitHub client run for real. Only outbound fetch is faked, through the
// same `state.githubHandler` the API tests use, so every request GitHub would see is recorded.
installMocks();

const { GithubApiError, createUserRepository, getAuthenticatedGithubUser, getGithubRepository } = await import(
	"../src/server/github"
);
const { GET: getStatus } = await import("../src/app/api/github/status/route");

const TOKEN = "gho_test_token";
const USER = { login: "octo", id: 1, avatar_url: null, html_url: "https://github.com/octo" };
const REPO = { name: "notes", full_name: "octo/notes", private: false, default_branch: "main", owner: { login: "octo" } };

type StatusBody = {
	connected: boolean;
	reason?: string;
	message?: string;
	retryAt?: string;
	missingScopes?: string[];
	scopes: string[];
};

function github(body: unknown, status = 200, headers: Record<string, string> = {}) {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

/** Answers each request in turn with the next response; a function entry is called (and may throw). */
function answerInOrder(responses: Array<Response | (() => Response)>) {
	const queue = [...responses];
	return () => {
		const next = queue.shift();
		if (!next) throw new Error("GitHub was called more often than the test expected");
		return typeof next === "function" ? next() : next;
	};
}

async function failureOf(request: Promise<unknown>) {
	try {
		await request;
	} catch (error) {
		if (error instanceof GithubApiError) return error;
		throw error;
	}
	throw new Error("Expected the GitHub request to fail");
}

function statusRequest(headers: Record<string, string> = {}) {
	return new Request("https://sketchflow.space/api/github/status", { headers });
}

beforeEach(() => {
	resetState();
	delete process.env.GITHUB_OAUTH_SCOPES;
});

describe("GitHub request headers", () => {
	test("sends a User-Agent with every request, as GitHub requires", async () => {
		// Arrange
		const seen: Headers[] = [];
		const recordingFetch = globalThis.fetch;
		globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
			seen.push(new Headers(init?.headers));
			return recordingFetch(input, init);
		}) as typeof fetch;
		state.githubHandler = () => github(USER);

		// Act
		try {
			await getAuthenticatedGithubUser(TOKEN);
		} finally {
			globalThis.fetch = recordingFetch;
		}

		// Assert
		expect(seen).toHaveLength(1);
		expect(seen[0].get("user-agent")).toBe("Sketchflow");
		expect(seen[0].get("authorization")).toBe(`Bearer ${TOKEN}`);
	});
});

describe("retrying GitHub requests", () => {
	test("retries a read once after a 503 and returns the second answer", async () => {
		state.githubHandler = answerInOrder([github({ message: "Service Unavailable" }, 503), github(REPO)]);

		const repository = await getGithubRepository(TOKEN, "octo", "notes");

		expect(repository.full_name).toBe("octo/notes");
		expect(state.github.map((call) => call.method)).toEqual(["GET", "GET"]);
	});

	test("retries a read once after a network failure", async () => {
		state.githubHandler = answerInOrder([
			() => {
				throw new TypeError("fetch failed");
			},
			github(REPO),
		]);

		const repository = await getGithubRepository(TOKEN, "octo", "notes");

		expect(repository.full_name).toBe("octo/notes");
		expect(state.github).toHaveLength(2);
	});

	test("retries a read once after a timeout", async () => {
		state.githubHandler = answerInOrder([
			() => {
				throw new DOMException("The operation was aborted.", "AbortError");
			},
			github(REPO),
		]);

		const repository = await getGithubRepository(TOKEN, "octo", "notes");

		expect(repository.full_name).toBe("octo/notes");
		expect(state.github).toHaveLength(2);
	});

	test("gives up after the one retry and reports GitHub as unavailable", async () => {
		state.githubHandler = () => github({ message: "Bad Gateway" }, 502);

		const error = await failureOf(getGithubRepository(TOKEN, "octo", "notes"));

		expect(state.github).toHaveLength(2);
		expect(error.code).toBe("github_unavailable");
		expect(error.status).toBe(502);
	});

	test("does not retry a read that failed for a reason a retry cannot fix", async () => {
		state.githubHandler = () => github({ message: "Not Found" }, 404);

		const error = await failureOf(getGithubRepository(TOKEN, "octo", "notes"));

		expect(state.github).toHaveLength(1);
		expect(error.code).toBe("github_not_found");
		expect(error.status).toBe(404);
	});

	test("never retries a write, even when GitHub answers 503", async () => {
		state.githubHandler = () => github({ message: "Service Unavailable" }, 503);

		const error = await failureOf(createUserRepository(TOKEN, "notes", true, "https://sketchflow.space"));

		expect(state.github.map((call) => call.method)).toEqual(["POST"]);
		expect(error.code).toBe("github_unavailable");
	});

	test("never retries a write that timed out, since it may already have been applied", async () => {
		state.githubHandler = () => {
			throw new DOMException("The operation was aborted.", "AbortError");
		};

		const error = await failureOf(createUserRepository(TOKEN, "notes", true, "https://sketchflow.space"));

		expect(state.github).toHaveLength(1);
		expect(error.code).toBe("github_unavailable");
		expect(error.status).toBe(504);
	});
});

describe("GithubApiError", () => {
	test("carries the reason and retry time read from GitHub's response", async () => {
		const resetSeconds = Math.floor(Date.now() / 1000) + 600;
		state.githubHandler = () =>
			github({ message: "API rate limit exceeded for user ID 1." }, 403, {
				"x-ratelimit-remaining": "0",
				"x-ratelimit-reset": String(resetSeconds),
			});

		const error = await failureOf(getGithubRepository(TOKEN, "octo", "notes"));

		expect(error.code).toBe("github_rate_limited");
		expect(error.retryAt).toBe(new Date(resetSeconds * 1000).toISOString());
		expect(error.status).toBe(403);
		expect(state.github).toHaveLength(1);
	});

	test("works out the reason from the status when built without a response", () => {
		expect(new GithubApiError("Public GitHub file read failed", 404).code).toBe("github_not_found");
		expect(new GithubApiError("Public GitHub file read failed", 500).code).toBe("github_unavailable");
	});

	test("never includes the token in the error", async () => {
		state.githubHandler = () => github({ message: "Bad credentials" }, 401);

		const error = await failureOf(getAuthenticatedGithubUser(TOKEN));

		expect(JSON.stringify({ message: error.message, response: error.response, code: error.code })).not.toContain(TOKEN);
	});
});

describe("GET /api/github/status", () => {
	test("reports connected when the sign-in token holds the repository scope", async () => {
		state.githubHandler = () => github(USER, 200, { "x-oauth-scopes": "read:user, repo, user:email" });

		const body = (await (await getStatus(statusRequest())).json()) as StatusBody;

		expect(body.connected).toBe(true);
		expect(body.scopes).toEqual(["repo", "read:user", "user:email"]);
	});

	test("reports a missing scope when the sign-in token was never granted repo", async () => {
		state.githubHandler = () => github(USER, 200, { "x-oauth-scopes": "read:user, user:email" });

		const body = (await (await getStatus(statusRequest())).json()) as StatusBody;

		expect(body.connected).toBe(false);
		expect(body.reason).toBe("github_missing_scope");
		expect(body.missingScopes).toEqual(["repo"]);
	});

	test("does not judge scopes for a token that reports none, such as a fine-grained token", async () => {
		state.githubHandler = () => github(USER);

		const body = (await (await getStatus(statusRequest())).json()) as StatusBody;

		expect(body.connected).toBe(true);
	});

	test("does not judge the scopes of a personal access token the user pasted", async () => {
		state.githubHandler = () => github(USER, 200, { "x-oauth-scopes": "public_repo" });

		const body = (await (await getStatus(statusRequest({ "x-sketchflow-github-token": "ghp_pasted" }))).json()) as StatusBody;

		expect(body.connected).toBe(true);
	});

	test("says the token is invalid, and only then, when GitHub answers 401", async () => {
		state.githubHandler = () => github({ message: "Bad credentials" }, 401);

		const body = (await (await getStatus(statusRequest())).json()) as StatusBody;

		expect(body).toMatchObject({ connected: false, reason: "github_token_invalid" });
	});

	test("reports a rate limit with the time it lifts instead of asking to reconnect", async () => {
		const resetSeconds = Math.floor(Date.now() / 1000) + 900;
		state.githubHandler = () =>
			github({ message: "API rate limit exceeded for user ID 1." }, 403, {
				"x-ratelimit-remaining": "0",
				"x-ratelimit-reset": String(resetSeconds),
			});

		const body = (await (await getStatus(statusRequest())).json()) as StatusBody;

		expect(body).toMatchObject({
			connected: false,
			reason: "github_rate_limited",
			retryAt: new Date(resetSeconds * 1000).toISOString(),
		});
		expect(body.message).toStartWith("GitHub is limiting requests. Try again at ");
		expect(body.message).not.toMatch(/reconnect|sign in/i);
	});

	test("reports an outage as unavailable after retrying the read once", async () => {
		state.githubHandler = () => github({ message: "Service Unavailable" }, 503);

		const body = (await (await getStatus(statusRequest())).json()) as StatusBody;

		expect(body).toMatchObject({ connected: false, reason: "github_unavailable" });
		expect(state.github).toHaveLength(2);
	});
});
