import { NextResponse } from "next/server";

import { UnauthorizedError } from "@/server/auth";

export function jsonOk<T>(data: T, init?: ResponseInit) {
	return NextResponse.json(data, init);
}

export function jsonError(error: unknown) {
	if (error instanceof UnauthorizedError) {
		return NextResponse.json({ error: error.message }, { status: 401 });
	}

	console.error(error);

	return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
