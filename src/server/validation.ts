import { BadRequestError } from "@/server/http";

export type JsonObject = Record<string, unknown>;

export function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requiredString(body: JsonObject, key: string) {
	const value = body[key];

	if (typeof value !== "string" || value.trim().length === 0) {
		throw new BadRequestError(`Expected "${key}" to be a non-empty string`);
	}

	return value.trim();
}

export function optionalString(body: JsonObject, key: string) {
	const value = body[key];

	if (value === undefined || value === null) {
		return undefined;
	}

	if (typeof value !== "string") {
		throw new BadRequestError(`Expected "${key}" to be a string`);
	}

	return value.trim();
}

export function optionalBoolean(body: JsonObject, key: string) {
	const value = body[key];

	if (value === undefined || value === null) {
		return undefined;
	}

	if (typeof value !== "boolean") {
		throw new BadRequestError(`Expected "${key}" to be a boolean`);
	}

	return value;
}
