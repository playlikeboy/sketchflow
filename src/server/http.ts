import { NextResponse } from "next/server";

import { GithubAccessTokenError, UnauthorizedError } from "@/server/auth";
import { BadRequestError, ForbiddenError, HttpError, NotFoundError } from "@/server/errors";
import { CrossSiteRequestError, assertSameOrigin as checkSameOrigin } from "@/server/origin";
import { createRateLimiter, type RateLimitRule } from "@/server/rate-limit";

export { BadRequestError, ForbiddenError, HttpError, NotFoundError };

// CSRF guard for cookie-authenticated mutating routes.
export function assertSameOrigin(request: Request) {
	try {
		checkSameOrigin(request);
	} catch (error) {
		if (error instanceof CrossSiteRequestError) {
			throw new ForbiddenError(error.message);
		}
		throw error;
	}
}

export class RateLimitError extends HttpError {
	readonly code = "rate_limited" as const;

	constructor(readonly retryAfterSeconds: number) {
		super("Too many requests. Try again shortly.", 429);
		this.name = "RateLimitError";
	}
}

const checkRateLimit = createRateLimiter();

export function assertRateLimit(scope: string, userId: string, rule: RateLimitRule) {
	const result = checkRateLimit(`${scope}:${userId}`, rule);
	if (!result.allowed) {
		throw new RateLimitError(result.retryAfterSeconds);
	}
}

export function jsonOk<T>(data: T, init?: ResponseInit) {
	return NextResponse.json(data, init);
}

// The machine-readable parts of an error the browser acts on: what went wrong, and for a
// GitHub rate limit, when it is worth trying again.
function errorDetails(error: object) {
	const code = "code" in error && typeof error.code === "string" ? { code: error.code } : {};
	const retryAt = "retryAt" in error && typeof error.retryAt === "string" ? { retryAt: error.retryAt } : {};

	return { ...code, ...retryAt };
}

export function jsonError(error: unknown) {
	if (error instanceof UnauthorizedError) {
		return NextResponse.json({ error: error.message }, { status: 401 });
	}

	if (error instanceof GithubAccessTokenError) {
		return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
	}

	if (error instanceof RateLimitError) {
		return NextResponse.json(
			{ error: error.message, code: error.code },
			{ status: error.status, headers: { "Retry-After": String(error.retryAfterSeconds) } },
		);
	}

	if (error instanceof HttpError) {
		return NextResponse.json({ error: error.message, ...errorDetails(error) }, { status: error.status });
	}

	console.error(error);

	return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
