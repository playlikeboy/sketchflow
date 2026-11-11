import { NextResponse } from "next/server";

import { GithubAccessTokenError, UnauthorizedError } from "@/server/auth";

export class HttpError extends Error {
	constructor(
		message: string,
		readonly status: number,
	) {
		super(message);
		this.name = "HttpError";
	}
}

export class BadRequestError extends HttpError {
	constructor(message: string) {
		super(message, 400);
		this.name = "BadRequestError";
	}
}

export class NotFoundError extends HttpError {
	constructor(message = "Not found") {
		super(message, 404);
		this.name = "NotFoundError";
	}
}

export class ForbiddenError extends HttpError {
	constructor(message = "Forbidden") {
		super(message, 403);
		this.name = "ForbiddenError";
	}
}

// CSRF guard for cookie-authenticated mutating routes: browsers always send Origin on
// cross-site POSTs, so reject any request whose Origin is not this app.
export function assertSameOrigin(request: Request) {
	if (request.headers.get("sec-fetch-site") === "cross-site") {
		throw new ForbiddenError("Cross-site requests are not allowed");
	}

	const origin = request.headers.get("origin");
	if (!origin) {
		return;
	}

	let originHost: string;
	try {
		originHost = new URL(origin).host;
	} catch {
		throw new ForbiddenError("Cross-site requests are not allowed");
	}

	const allowedHosts = new Set<string>();
	const hostHeader = request.headers.get("host");
	if (hostHeader) allowedHosts.add(hostHeader);
	try {
		allowedHosts.add(new URL(request.url).host);
	} catch {
		// ignore unparsable request URLs
	}

	if (!allowedHosts.has(originHost)) {
		throw new ForbiddenError("Cross-site requests are not allowed");
	}
}

export function jsonOk<T>(data: T, init?: ResponseInit) {
	return NextResponse.json(data, init);
}

function errorCode(error: unknown) {
	if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
		return { code: error.code };
	}

	return {};
}

export function jsonError(error: unknown) {
	if (error instanceof UnauthorizedError) {
		return NextResponse.json({ error: error.message }, { status: 401 });
	}

	if (error instanceof GithubAccessTokenError) {
		return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
	}

	if (error instanceof HttpError) {
		return NextResponse.json({ error: error.message, ...errorCode(error) }, { status: error.status });
	}

	console.error(error);

	return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
