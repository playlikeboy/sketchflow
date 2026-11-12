import { describe, expect, test } from "bun:test";

import { ApiError } from "../src/lib/api";
import {
	GITHUB_ERROR_CODES,
	classifyGithubFailure,
	formatRetryTime,
	githubErrorCopy,
	githubProblemFromError,
	githubProblemFromStatus,
	isGithubErrorCode,
	isRepositoryScope,
	isTransientGithubError,
	missingGithubScopes,
	needsGithubReconnect,
	nonGithubErrorMessage,
	parseGithubScopes,
	pickGithubProblem,
} from "../src/lib/github-errors";
import { planSyncFailure } from "../src/lib/sync-manager";

const NOW = Date.parse("2026-11-12T14:00:00.000Z");
const DOCS = "https://docs.github.com/rest";

describe("classifyGithubFailure", () => {
	test("calls a 401 with bad credentials an invalid token", () => {
		// Arrange
		const failure = { status: 401, message: "Bad credentials", headers: new Headers() };

		// Act
		const problem = classifyGithubFailure(failure, NOW);

		// Assert
		expect(problem).toEqual({ code: "github_token_invalid" });
	});

	test("calls a 403 with no quota left rate limited and reports when the quota resets", () => {
		const resetAt = NOW + 32 * 60_000;
		const headers = new Headers({
			"x-ratelimit-limit": "5000",
			"x-ratelimit-remaining": "0",
			"x-ratelimit-reset": String(resetAt / 1000),
		});

		const problem = classifyGithubFailure(
			{ status: 403, message: "API rate limit exceeded for user ID 583231.", headers },
			NOW,
		);

		expect(problem).toEqual({ code: "github_rate_limited", retryAt: "2026-11-12T14:32:00.000Z" });
	});

	test("calls a secondary rate limit rate limited and honours retry-after", () => {
		const headers = new Headers({ "retry-after": "60", "x-ratelimit-remaining": "4990" });

		const problem = classifyGithubFailure(
			{
				status: 403,
				message: "You have exceeded a secondary rate limit. Please wait a few minutes before you try again.",
				headers,
			},
			NOW,
		);

		expect(problem).toEqual({ code: "github_rate_limited", retryAt: "2026-11-12T14:01:00.000Z" });
	});

	test("calls a 429 rate limited even when GitHub gives no time to wait", () => {
		const problem = classifyGithubFailure({ status: 429, message: "Too Many Requests", headers: new Headers() }, NOW);

		expect(problem).toEqual({ code: "github_rate_limited" });
	});

	test("calls a 403 from organisation SAML enforcement access denied, not a sign-in problem", () => {
		const headers = new Headers({
			"x-github-sso": "required; url=https://github.com/orgs/octo-org/sso?authorization_request=abc",
			"x-oauth-scopes": "repo, read:user, user:email",
			"x-accepted-oauth-scopes": "repo",
		});

		const problem = classifyGithubFailure(
			{
				status: 403,
				message: "Resource protected by organization SAML enforcement. You must grant your OAuth token access to this organization.",
				headers,
			},
			NOW,
		);

		expect(problem).toEqual({ code: "github_access_denied" });
	});

	test("calls a 403 from OAuth app restrictions access denied", () => {
		const message =
			"Although you appear to have the correct authorization credentials, the `octo-org` organization has enabled OAuth App access restrictions, meaning that data access to third-parties is limited.";

		const problem = classifyGithubFailure({ status: 403, message, headers: new Headers() }, NOW);

		expect(problem).toEqual({ code: "github_access_denied" });
	});

	test("calls a 403 for a resource the token may not touch access denied", () => {
		const problem = classifyGithubFailure(
			{ status: 403, message: "Resource not accessible by personal access token", headers: new Headers() },
			NOW,
		);

		expect(problem).toEqual({ code: "github_access_denied" });
	});

	test("calls a 403 a missing scope when the token holds none of the accepted scopes", () => {
		const headers = new Headers({
			"x-oauth-scopes": "read:user, user:email",
			"x-accepted-oauth-scopes": "repo",
			"x-ratelimit-remaining": "4987",
		});

		const problem = classifyGithubFailure({ status: 403, message: "Forbidden", headers }, NOW);

		expect(problem).toEqual({ code: "github_missing_scope" });
	});

	test("does not report a missing scope when a broader granted scope covers the accepted one", () => {
		const headers = new Headers({ "x-oauth-scopes": "repo", "x-accepted-oauth-scopes": "public_repo" });

		const problem = classifyGithubFailure({ status: 403, message: "Must have admin rights to Repository.", headers }, NOW);

		expect(problem).toEqual({ code: "github_access_denied" });
	});

	test("calls a 404 not found, whatever scopes the token has", () => {
		const headers = new Headers({ "x-oauth-scopes": "read:user", "x-accepted-oauth-scopes": "repo" });

		const problem = classifyGithubFailure({ status: 404, message: "Not Found", headers }, NOW);

		expect(problem).toEqual({ code: "github_not_found" });
	});

	test("calls server errors and timeouts unavailable", () => {
		for (const status of [500, 502, 503, 504, 408]) {
			const problem = classifyGithubFailure({ status, message: "Server Error" }, NOW);

			expect(problem).toEqual({ code: "github_unavailable" });
		}
	});

	test("calls a 422 a plain API error", () => {
		const problem = classifyGithubFailure(
			{ status: 422, message: "Validation Failed", headers: new Headers({ "x-ratelimit-remaining": "4000" }) },
			NOW,
		);

		expect(problem).toEqual({ code: "github_api_error" });
	});

	test("classifies from the status alone when there are no headers or message", () => {
		expect(classifyGithubFailure({ status: 401 }).code).toBe("github_token_invalid");
		expect(classifyGithubFailure({ status: 403 }).code).toBe("github_access_denied");
		expect(classifyGithubFailure({ status: 404 }).code).toBe("github_not_found");
		expect(classifyGithubFailure({ status: 504 }).code).toBe("github_unavailable");
	});
});

describe("scope detection", () => {
	test("reads the scopes GitHub lists in x-oauth-scopes", () => {
		expect(parseGithubScopes("repo, read:user,user:email")).toEqual(["repo", "read:user", "user:email"]);
	});

	test("tells a token with no scopes apart from a token that does not report scopes", () => {
		expect(parseGithubScopes("")).toEqual([]);
		expect(parseGithubScopes(null)).toBeNull();
	});

	test("finds the repository scope missing from a sign-in that never granted it", () => {
		const granted = parseGithubScopes("read:user, user:email");

		expect(missingGithubScopes(["repo"], granted)).toEqual(["repo"]);
	});

	test("accepts a broader scope in place of the narrower one that was asked for", () => {
		const granted = parseGithubScopes("repo, user");

		expect(missingGithubScopes(["public_repo", "read:user", "user:email"], granted)).toEqual([]);
	});

	test("never fails a token that reports no scopes, such as a fine-grained token", () => {
		expect(missingGithubScopes(["repo"], null)).toEqual([]);
	});

	test("treats only repo and public_repo as scopes that gate repository access", () => {
		expect(["repo", "read:user", "user:email", "public_repo"].filter(isRepositoryScope)).toEqual(["repo", "public_repo"]);
	});
});

describe("githubErrorCopy", () => {
	test("tells a rate-limited user the time they can try again", () => {
		const copy = githubErrorCopy("github_rate_limited", {
			retryAt: "2026-11-12T14:32:00.000Z",
			now: NOW,
			locale: "en-GB",
			timeZone: "UTC",
		});

		expect(copy.message).toBe("GitHub is limiting requests. Try again at 14:32.");
		expect(copy.action).toBe("wait");
	});

	test("falls back to a general wait when the retry time is unknown or already past", () => {
		const unknown = githubErrorCopy("github_rate_limited", { now: NOW });
		const past = githubErrorCopy("github_rate_limited", { retryAt: "2026-11-12T13:00:00.000Z", now: NOW });

		expect(unknown.message).toBe("GitHub is limiting requests. Try again in a few minutes.");
		expect(past.message).toBe(unknown.message);
		expect(formatRetryTime({ retryAt: "not a date", now: NOW })).toBeNull();
	});

	test("explains a missing repository in plain language and offers a retry", () => {
		const copy = githubErrorCopy("github_not_found");

		expect(copy.message).toBe("The repository was renamed, removed, or you no longer have access to it.");
		expect(copy.action).toBe("retry");
	});

	test("asks for a sign-in only for the codes that a sign-in fixes", () => {
		const signInCodes = GITHUB_ERROR_CODES.filter((code) => githubErrorCopy(code).action === "sign-in");

		expect(signInCodes).toEqual([
			"github_not_connected",
			"github_token_unavailable",
			"github_token_invalid",
			"github_missing_scope",
		]);
		expect(signInCodes.every(needsGithubReconnect)).toBe(true);
	});

	test("never mentions reconnecting or signing in for problems a sign-in cannot fix", () => {
		const calmCodes = GITHUB_ERROR_CODES.filter((code) => !needsGithubReconnect(code));

		for (const code of calmCodes) {
			const copy = githubErrorCopy(code);

			expect(`${copy.title} ${copy.message}`).not.toMatch(/reconnect|sign in|sign-in/i);
			expect(copy.action).not.toBe("sign-in");
		}
	});

	test("points an access-denied user at their GitHub settings", () => {
		expect(githubErrorCopy("github_access_denied").action).toBe("open-github");
	});

	test("gives every code a title and a message", () => {
		for (const code of GITHUB_ERROR_CODES) {
			const copy = githubErrorCopy(code);

			expect(copy.title.length).toBeGreaterThan(0);
			expect(copy.message.length).toBeGreaterThan(0);
		}
	});
});

describe("reading a problem from an error or a status response", () => {
	test("recognises the known codes and nothing else", () => {
		expect(isGithubErrorCode("github_rate_limited")).toBe(true);
		expect(isGithubErrorCode("github_conflict")).toBe(false);
		expect(isGithubErrorCode("rate_limited")).toBe(false);
		expect(isGithubErrorCode(undefined)).toBe(false);
	});

	test("reads the code and retry time from an ApiError", () => {
		const error = new ApiError("API rate limit exceeded", 403, "github_rate_limited", "2026-11-12T14:32:00.000Z");

		expect(githubProblemFromError(error)).toEqual({ code: "github_rate_limited", retryAt: "2026-11-12T14:32:00.000Z" });
	});

	test("ignores errors that are not GitHub problems, even when their message mentions GitHub", () => {
		const badRequest = new ApiError("Invalid GitHub repository name", 400);
		const conflict = new ApiError("GitHub branch changed", 409, "github_conflict");

		expect(githubProblemFromError(badRequest)).toBeNull();
		expect(githubProblemFromError(conflict)).toBeNull();
		expect(githubProblemFromError(null)).toBeNull();
		expect(nonGithubErrorMessage(badRequest)).toBe("Invalid GitHub repository name");
	});

	test("gives no plain message for a GitHub problem, which has its own copy", () => {
		expect(nonGithubErrorMessage(new ApiError("Bad credentials", 401, "github_token_invalid"))).toBeNull();
		expect(nonGithubErrorMessage(undefined)).toBeNull();
	});

	test("reads the reason from a disconnected status response", () => {
		const status = { connected: false, reason: "github_unavailable", message: "GitHub is not responding.", scopes: [] };

		expect(githubProblemFromStatus(status)).toEqual({ code: "github_unavailable" });
	});

	test("reports no problem for a connected status or one still loading", () => {
		expect(githubProblemFromStatus({ connected: true, scopes: ["repo"] })).toBeNull();
		expect(githubProblemFromStatus(undefined)).toBeNull();
	});

	test("shows the sign-in problem first when several requests failed", () => {
		const picked = pickGithubProblem([
			null,
			{ code: "github_unavailable" },
			{ code: "github_token_invalid" },
			{ code: "github_rate_limited" },
		]);

		expect(picked).toEqual({ code: "github_token_invalid" });
		expect(pickGithubProblem([null, undefined])).toBeNull();
	});
});

describe("planSyncFailure", () => {
	test("stops at once when GitHub rejects the sign-in", () => {
		const plan = planSyncFailure({ problem: { code: "github_token_invalid" }, attempts: 1, now: NOW });

		expect(plan).toEqual({ outcome: "failed" });
	});

	test("stops at once when the Sketchflow session has expired", () => {
		const plan = planSyncFailure({ problem: null, sessionExpired: true, attempts: 1, now: NOW });

		expect(plan).toEqual({ outcome: "failed" });
	});

	test("waits until the rate limit lifts before retrying", () => {
		const plan = planSyncFailure({
			problem: { code: "github_rate_limited", retryAt: "2026-11-12T14:32:00.000Z" },
			attempts: 1,
			now: NOW,
		});

		expect(plan).toEqual({ outcome: "retry", delayMs: 32 * 60_000 });
	});

	test("keeps retrying an outage long after an ordinary error would have been given up on", () => {
		const outage = { code: "github_unavailable" } as const;

		const ordinary = planSyncFailure({ problem: { code: "github_api_error" }, attempts: 10, now: NOW });
		const transient = planSyncFailure({ problem: outage, attempts: 10, now: NOW });
		const transientMuchLater = planSyncFailure({ problem: outage, attempts: 39, now: NOW });
		const transientExhausted = planSyncFailure({ problem: outage, attempts: 40, now: NOW });

		expect(ordinary).toEqual({ outcome: "failed" });
		expect(transient).toEqual({ outcome: "retry", delayMs: 5 * 60_000 });
		expect(transientMuchLater.outcome).toBe("retry");
		expect(transientExhausted).toEqual({ outcome: "failed" });
		expect(isTransientGithubError("github_unavailable")).toBe(true);
	});

	test("retries an ordinary error with a short, capped backoff", () => {
		const first = planSyncFailure({ problem: null, attempts: 1, now: NOW });
		const later = planSyncFailure({ problem: null, attempts: 9, now: NOW });

		expect(first).toEqual({ outcome: "retry", delayMs: 2_000 });
		expect(later).toEqual({ outcome: "retry", delayMs: 30_000 });
	});
});
