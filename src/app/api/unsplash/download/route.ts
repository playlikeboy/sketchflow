import { BadRequestError, RateLimitError, assertSameOrigin, jsonError, jsonOk } from "@/server/http";
import { checkUnsplashRateLimit, trackUnsplashDownload, withNoStore } from "@/server/unsplash";
import { isJsonObject } from "@/server/validation";

const MAX_BODY_BYTES = 2_048;

/** Reads the body as text, giving up as soon as it is too large rather than buffering it all. */
async function readSmallBody(request: Request) {
	const declaredLength = Number(request.headers.get("content-length") ?? "0");
	if (!Number.isFinite(declaredLength) || declaredLength > MAX_BODY_BYTES) {
		throw new BadRequestError("The request body is too large");
	}

	const reader = request.body?.getReader();
	if (!reader) return "";

	// A chunked request declares no length, so the bytes are counted as they arrive.
	const decoder = new TextDecoder();
	let text = "";
	let receivedBytes = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) return text + decoder.decode();

		receivedBytes += value.byteLength;
		if (receivedBytes > MAX_BODY_BYTES) {
			await reader.cancel();
			throw new BadRequestError("The request body is too large");
		}
		text += decoder.decode(value, { stream: true });
	}
}

async function readJsonBody(request: Request): Promise<unknown> {
	const body = await readSmallBody(request);

	try {
		return JSON.parse(body);
	} catch {
		throw new BadRequestError("Expected a JSON object body");
	}
}

// Unsplash requires this call whenever one of its photos is used. Public like the search route,
// so it is same-origin only, rate limited per visitor, and will only ever request a validated
// `https://api.unsplash.com/photos/<id>/download` URL, for a photo whose token shows this server
// handed it out in a search. Repeats and an exhausted hourly budget answer ok without calling Unsplash.
export async function POST(request: Request) {
	try {
		assertSameOrigin(request);
		const rateLimit = checkUnsplashRateLimit("download", request);
		if (!rateLimit.allowed) {
			throw new RateLimitError(rateLimit.retryAfterSeconds);
		}

		const body = await readJsonBody(request);
		if (!isJsonObject(body)) {
			throw new BadRequestError("Expected a JSON object body");
		}

		await trackUnsplashDownload({ downloadLocation: body.downloadLocation, downloadToken: body.downloadToken });

		return withNoStore(jsonOk({ ok: true }));
	} catch (error) {
		return withNoStore(jsonError(error));
	}
}
