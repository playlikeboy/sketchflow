import type { NextRequest } from "next/server";

import { RateLimitError, jsonError, jsonOk } from "@/server/http";
import { checkUnsplashRateLimit, parseSearchPage, parseSearchQuery, searchUnsplashPhotos, withNoStore } from "@/server/unsplash";

// Search results change slowly and the Unsplash budget is small, so let shared caches keep them.
const SEARCH_CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";

// Public on purpose: Sketchflow works signed out. Guarded by a per-visitor rate limit and
// strict parameter validation instead of a session.
export async function GET(request: NextRequest) {
	try {
		const rateLimit = checkUnsplashRateLimit("search", request);
		if (!rateLimit.allowed) {
			throw new RateLimitError(rateLimit.retryAfterSeconds);
		}

		const params = request.nextUrl.searchParams;
		const query = parseSearchQuery(params.get("q"));
		const page = parseSearchPage(params.get("page"));
		const result = await searchUnsplashPhotos({ query, page });

		return jsonOk(result, { headers: { "Cache-Control": SEARCH_CACHE_CONTROL } });
	} catch (error) {
		return withNoStore(jsonError(error));
	}
}
