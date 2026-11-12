// What went wrong between Sketchflow and GitHub, in one vocabulary shared by the server
// (which classifies a failed GitHub response) and the browser (which explains it).
// No React and no server-only imports, so every function here can be unit tested.

export const GITHUB_ERROR_CODES = [
	/** No GitHub account is linked to this session. */
	"github_not_connected",
	/** The session could not hand over its GitHub token (raised by src/server/auth.ts). */
	"github_token_unavailable",
	/** GitHub rejected the token (401). The only API failure that means "sign in again". */
	"github_token_invalid",
	/** The token works but was never granted a scope the request needs. */
	"github_missing_scope",
	/** Primary or secondary rate limit. `retryAt` says when it lifts, when GitHub told us. */
	"github_rate_limited",
	/** Organisation, SSO or OAuth-app restrictions, or a resource the token may not touch. */
	"github_access_denied",
	/** Repository, branch or file not found. GitHub also answers 404 for private repos it hides. */
	"github_not_found",
	/** GitHub is down, slow, or could not be reached. */
	"github_unavailable",
	/** Anything else GitHub refused, such as a 422. */
	"github_api_error",
] as const;

export type GithubErrorCode = (typeof GITHUB_ERROR_CODES)[number];

export type GithubErrorAction = "sign-in" | "retry" | "wait" | "open-github" | "none";

export type GithubErrorCopy = {
	title: string;
	message: string;
	action: GithubErrorAction;
};

export type GithubProblem = {
	code: GithubErrorCode;
	/** ISO time after which a rate-limited request may be tried again. */
	retryAt?: string;
};

const RECONNECT_CODES: ReadonlySet<GithubErrorCode> = new Set([
	"github_not_connected",
	"github_token_unavailable",
	"github_token_invalid",
	"github_missing_scope",
]);

const TRANSIENT_CODES: ReadonlySet<GithubErrorCode> = new Set(["github_rate_limited", "github_unavailable"]);

export function isGithubErrorCode(value: unknown): value is GithubErrorCode {
	return typeof value === "string" && (GITHUB_ERROR_CODES as readonly string[]).includes(value);
}

/** True when signing in to GitHub again (or supplying a token) is what fixes the problem. */
export function needsGithubReconnect(code: GithubErrorCode): boolean {
	return RECONNECT_CODES.has(code);
}

/** True when the same request is expected to work later without the user doing anything. */
export function isTransientGithubError(code: GithubErrorCode): boolean {
	return TRANSIENT_CODES.has(code);
}

// ---------------------------------------------------------------------------------------------
// Classifying a failed GitHub response
// ---------------------------------------------------------------------------------------------

export type GithubFailure = {
	status: number;
	/** The `message` field of GitHub's JSON error body, when there was one. */
	message?: string | null;
	headers?: Headers | null;
};

const RATE_LIMIT_MESSAGE = /rate limit|abuse detection/i;
const ACCESS_RESTRICTION_MESSAGE = /saml|single sign-on|oauth app access restrictions|resource not accessible/i;

// A granted scope also grants the narrower scopes listed against it.
const IMPLIED_SCOPES: Readonly<Record<string, readonly string[]>> = {
	repo: ["public_repo", "repo:status", "repo_deployment", "repo:invite", "security_events"],
	user: ["read:user", "user:email", "user:follow"],
	"admin:org": ["write:org", "read:org"],
	"write:org": ["read:org"],
	"admin:repo_hook": ["write:repo_hook", "read:repo_hook"],
	"write:repo_hook": ["read:repo_hook"],
	"write:packages": ["read:packages"],
};

const REPOSITORY_SCOPES: ReadonlySet<string> = new Set(["repo", "public_repo"]);

/**
 * Reads an `x-oauth-scopes` style header. Returns null when the header is absent, which is
 * how fine-grained and GitHub App tokens answer: they have no scopes to compare.
 */
export function parseGithubScopes(header: string | null | undefined): string[] | null {
	if (header === null || header === undefined) return null;

	return header
		.split(",")
		.map((scope) => scope.trim())
		.filter(Boolean);
}

function scopeIsGranted(scope: string, granted: readonly string[]) {
	return granted.some((held) => held === scope || (IMPLIED_SCOPES[held] ?? []).includes(scope));
}

/**
 * The required scopes a token does not hold. `granted` is null for tokens that do not
 * report scopes, and those are never judged: the answer is then always "nothing missing".
 */
export function missingGithubScopes(required: readonly string[], granted: readonly string[] | null): string[] {
	if (granted === null) return [];
	return required.filter((scope) => !scopeIsGranted(scope, granted));
}

/** The scopes that decide whether Sketchflow can read and write repositories at all. */
export function isRepositoryScope(scope: string): boolean {
	return REPOSITORY_SCOPES.has(scope);
}

function parseRetryAfter(value: string | null, now: number): number | null {
	if (!value) return null;

	const seconds = Number(value);
	if (Number.isFinite(seconds)) return now + Math.max(0, seconds) * 1000;

	const date = Date.parse(value);
	return Number.isNaN(date) ? null : date;
}

function parseRateLimitReset(headers: Headers): number | null {
	if (headers.get("x-ratelimit-remaining") !== "0") return null;

	const resetSeconds = Number(headers.get("x-ratelimit-reset"));
	return Number.isFinite(resetSeconds) && resetSeconds > 0 ? resetSeconds * 1000 : null;
}

function rateLimitRetryAt(headers: Headers, now: number): string | undefined {
	const retryAtMs = parseRetryAfter(headers.get("retry-after"), now) ?? parseRateLimitReset(headers);
	return retryAtMs === null ? undefined : new Date(retryAtMs).toISOString();
}

function isRateLimited(failure: GithubFailure, headers: Headers) {
	if (failure.status === 429) return true;
	if (failure.status !== 403) return false;

	return (
		headers.get("x-ratelimit-remaining") === "0" ||
		headers.has("retry-after") ||
		RATE_LIMIT_MESSAGE.test(failure.message ?? "")
	);
}

function isAccessRestriction(failure: GithubFailure, headers: Headers) {
	return headers.has("x-github-sso") || ACCESS_RESTRICTION_MESSAGE.test(failure.message ?? "");
}

// GitHub lists the scopes that would have been enough; holding any one of them passes.
function lacksAcceptedScope(headers: Headers) {
	const granted = parseGithubScopes(headers.get("x-oauth-scopes"));
	const accepted = parseGithubScopes(headers.get("x-accepted-oauth-scopes")) ?? [];
	if (granted === null || accepted.length === 0) return false;

	return !accepted.some((scope) => scopeIsGranted(scope, granted));
}

function classifyForbidden(failure: GithubFailure, headers: Headers): GithubErrorCode {
	if (isAccessRestriction(failure, headers)) return "github_access_denied";
	if (lacksAcceptedScope(headers)) return "github_missing_scope";
	return "github_access_denied";
}

/**
 * Names the reason a GitHub request failed, from its status, error message and headers.
 * Pure: the same input always gives the same answer (`now` is only used for `retryAt`).
 */
export function classifyGithubFailure(failure: GithubFailure, now: number = Date.now()): GithubProblem {
	const headers = failure.headers ?? new Headers();

	if (failure.status === 401) return { code: "github_token_invalid" };

	if (isRateLimited(failure, headers)) {
		const retryAt = rateLimitRetryAt(headers, now);
		return retryAt ? { code: "github_rate_limited", retryAt } : { code: "github_rate_limited" };
	}

	if (failure.status === 403) return { code: classifyForbidden(failure, headers) };
	if (failure.status === 404) return { code: "github_not_found" };
	if (failure.status === 408 || failure.status >= 500) return { code: "github_unavailable" };

	return { code: "github_api_error" };
}

// ---------------------------------------------------------------------------------------------
// Reading a problem back out of an error or a status response
// ---------------------------------------------------------------------------------------------

function readField(source: unknown, field: string): unknown {
	return source && typeof source === "object" && field in source ? (source as Record<string, unknown>)[field] : undefined;
}

function problemFrom(code: unknown, retryAt: unknown): GithubProblem | null {
	if (!isGithubErrorCode(code)) return null;
	return typeof retryAt === "string" && retryAt ? { code, retryAt } : { code };
}

/**
 * The GitHub problem carried by a thrown value, or null when it is some other kind of error.
 * Works with `ApiError` from src/lib/api.ts and with anything else exposing `code`/`retryAt`.
 */
export function githubProblemFromError(error: unknown): GithubProblem | null {
	return problemFrom(readField(error, "code"), readField(error, "retryAt"));
}

/** The GitHub problem reported by `GET /api/github/status`, or null when GitHub is connected. */
export function githubProblemFromStatus(status: unknown): GithubProblem | null {
	if (readField(status, "connected") !== false) return null;
	return problemFrom(readField(status, "reason"), readField(status, "retryAt"));
}

/**
 * Chooses the one problem worth showing when several requests failed: a problem that needs
 * signing in wins, since nothing else will work until that is done.
 */
export function pickGithubProblem(candidates: ReadonlyArray<GithubProblem | null | undefined>): GithubProblem | null {
	const problems = candidates.filter((candidate): candidate is GithubProblem => Boolean(candidate));
	return problems.find((problem) => needsGithubReconnect(problem.code)) ?? problems[0] ?? null;
}

// ---------------------------------------------------------------------------------------------
// Plain-language copy
// ---------------------------------------------------------------------------------------------

export type GithubErrorCopyOptions = {
	retryAt?: string | null;
	/** Locale and time zone are overridable so the wording can be tested. */
	locale?: string;
	timeZone?: string;
	now?: number;
};

/** "14:32" for a retry time still ahead of `now`; null when it is unknown or already past. */
export function formatRetryTime(options: GithubErrorCopyOptions = {}): string | null {
	const retryAtMs = options.retryAt ? Date.parse(options.retryAt) : Number.NaN;
	if (Number.isNaN(retryAtMs) || retryAtMs <= (options.now ?? Date.now())) return null;

	return new Intl.DateTimeFormat(options.locale, {
		hour: "2-digit",
		minute: "2-digit",
		timeZone: options.timeZone,
	}).format(new Date(retryAtMs));
}

function rateLimitedCopy(options: GithubErrorCopyOptions): GithubErrorCopy {
	const retryTime = formatRetryTime(options);

	return {
		title: "Too many requests to GitHub",
		message: retryTime
			? `GitHub is limiting requests. Try again at ${retryTime}.`
			: "GitHub is limiting requests. Try again in a few minutes.",
		action: "wait",
	};
}

const FIXED_COPY: Record<Exclude<GithubErrorCode, "github_rate_limited">, GithubErrorCopy> = {
	github_not_connected: {
		title: "GitHub is not connected",
		message: "Connect GitHub so Sketchflow can read and save to your repository.",
		action: "sign-in",
	},
	github_token_unavailable: {
		title: "GitHub sign-in needs refreshing",
		message: "Sketchflow could not read your GitHub sign-in. Sign in again to keep saving to your repository.",
		action: "sign-in",
	},
	github_token_invalid: {
		title: "GitHub sign-in has expired",
		message: "GitHub no longer accepts this sign-in. Sign in again to keep saving to your repository.",
		action: "sign-in",
	},
	github_missing_scope: {
		title: "Repository permission is missing",
		message:
			"Sketchflow was not given permission to read and write your repositories. Reconnect GitHub and approve repository access.",
		action: "sign-in",
	},
	github_access_denied: {
		title: "GitHub blocked access to this repository",
		message:
			"Your organisation or the repository's settings do not allow Sketchflow to use it. Check the access settings on GitHub, then try again.",
		action: "open-github",
	},
	github_not_found: {
		title: "Repository not found",
		message: "The repository was renamed, removed, or you no longer have access to it.",
		action: "retry",
	},
	github_unavailable: {
		title: "GitHub is not responding",
		message: "GitHub is not responding right now. Nothing is lost: try again in a moment.",
		action: "retry",
	},
	github_api_error: {
		title: "GitHub could not complete the request",
		message: "GitHub could not complete that request. Try again.",
		action: "retry",
	},
};

/** The heading, sentence and next step to show for a GitHub problem. */
export function githubErrorCopy(code: GithubErrorCode, options: GithubErrorCopyOptions = {}): GithubErrorCopy {
	return code === "github_rate_limited" ? rateLimitedCopy(options) : FIXED_COPY[code];
}

/**
 * The message of an error that is not a GitHub problem, for showing as ordinary error text.
 * Null for GitHub problems: those are explained by `githubErrorCopy`, not by their raw message.
 */
export function nonGithubErrorMessage(error: unknown): string | null {
	if (!(error instanceof Error) || githubProblemFromError(error)) return null;
	return error.message;
}
