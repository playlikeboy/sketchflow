import { NextResponse } from "next/server";

import { UnauthorizedError } from "@/server/auth";

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

export function jsonOk<T>(data: T, init?: ResponseInit) {
	return NextResponse.json(data, init);
}

export function jsonError(error: unknown) {
	if (error instanceof UnauthorizedError) {
		return NextResponse.json({ error: error.message }, { status: 401 });
	}

	if (error instanceof HttpError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}

	console.error(error);

	return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
