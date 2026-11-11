// HTTP error types. Kept free of server-only imports so they can be unit tested.

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
