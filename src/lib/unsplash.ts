// Types and browser helpers for the Insert panel's Photos tab. The Unsplash access key never
// reaches this file: the browser talks to /api/unsplash/*, and only fetches image bytes from
// Unsplash's image host directly (hotlinking the URLs the API returned, as Unsplash requires).

/** The small, safe subset of an Unsplash photo that the server sends to the browser. */
export type UnsplashPhoto = {
	id: string;
	description: string;
	width: number;
	height: number;
	/** Dominant colour as a hex string, used as the placeholder behind the thumbnail. */
	color: string;
	thumbUrl: string;
	regularUrl: string;
	photographerName: string;
	photographerUrl: string;
	photoPageUrl: string;
	/** Unsplash's download-tracking endpoint for this photo. Reported when the photo is used. */
	downloadLocation: string;
};

export type UnsplashSearchResponse = {
	photos: UnsplashPhoto[];
	totalPages: number;
};

export const UNSPLASH_MAX_QUERY_LENGTH = 100;
export const UNSPLASH_MAX_PAGE = 20;
export const UNSPLASH_IMAGE_ORIGIN = "https://images.unsplash.com";
export const UNSPLASH_REFERRAL_PARAMS = { utm_source: "sketchflow", utm_medium: "referral" } as const;
export const UNSPLASH_HOME_URL = "https://unsplash.com/?utm_source=sketchflow&utm_medium=referral";

/**
 * Canonical form of a search: control characters removed, whitespace collapsed, lower case.
 * The browser and the server both use it, so the same search always hits the same cache entry.
 */
export function normalizeUnsplashQuery(raw: string) {
	return raw.replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

// A tile is its photo plus a one-line credit; this is the credit's height as a share of the tile width.
const CAPTION_HEIGHT_RATIO = 0.16;

/**
 * Deals photos into columns for a masonry grid, always adding to the shortest column. A photo's
 * column depends only on the photos before it, so loading another page never moves earlier ones.
 */
export function arrangeInColumns<T extends { width: number; height: number }>(items: readonly T[], columnCount: number) {
	const columns: T[][] = Array.from({ length: Math.max(1, columnCount) }, () => []);
	const heights = columns.map(() => 0);

	for (const item of items) {
		const shortest = heights.indexOf(Math.min(...heights));
		columns[shortest].push(item);
		heights[shortest] += item.height / item.width + CAPTION_HEIGHT_RATIO;
	}

	return columns;
}

export type UnsplashFailureKind ="not_configured" | "rate_limited" | "failed";

/** A failed photo request, classified so the tab can say something useful. */
export class UnsplashRequestError extends Error {
	constructor(
		readonly kind: UnsplashFailureKind,
		message = "Photo search failed.",
	) {
		super(message);
		this.name = "UnsplashRequestError";
	}
}

/** Maps a failed /api/unsplash response to what went wrong. Any 429 means "slow down". */
export function classifyUnsplashFailure(status: number, code?: string): UnsplashFailureKind {
	if (code === "unsplash_not_configured") return "not_configured";
	if (status === 429 || code === "unsplash_rate_limited" || code === "rate_limited") return "rate_limited";
	return "failed";
}

export function unsplashSearchPath(query: string, page: number) {
	const params = new URLSearchParams({ q: normalizeUnsplashQuery(query), page: String(page) });
	return `/api/unsplash/search?${params.toString()}`;
}

function readErrorCode(body: unknown) {
	if (body && typeof body === "object" && "code" in body && typeof body.code === "string") {
		return body.code;
	}
	return undefined;
}

/** Searches photos through the app's own server route. Throws UnsplashRequestError on failure. */
export async function fetchUnsplashPhotos(input: { query: string; page: number }): Promise<UnsplashSearchResponse> {
	let response: Response;
	try {
		// No cookies and no custom headers: the route is public and its responses are shared-cacheable.
		response = await fetch(unsplashSearchPath(input.query, input.page), { credentials: "omit" });
	} catch {
		throw new UnsplashRequestError("failed", "The photo search could not be reached.");
	}

	const body: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		throw new UnsplashRequestError(classifyUnsplashFailure(response.status, readErrorCode(body)));
	}
	if (!body || typeof body !== "object" || !("photos" in body) || !Array.isArray(body.photos)) {
		throw new UnsplashRequestError("failed", "The photo search returned an unexpected response.");
	}

	const totalPages = "totalPages" in body && typeof body.totalPages === "number" ? body.totalPages : 1;
	return { photos: body.photos as UnsplashPhoto[], totalPages };
}

/** Downloads the photo itself, straight from Unsplash's image host. */
export async function fetchUnsplashPhotoBlob(photo: Pick<UnsplashPhoto, "regularUrl">) {
	if (!photo.regularUrl.startsWith(`${UNSPLASH_IMAGE_ORIGIN}/`)) {
		throw new Error("This photo is not hosted by Unsplash.");
	}

	const response = await fetch(photo.regularUrl, { credentials: "omit" });
	if (!response.ok) {
		throw new Error(`The photo could not be downloaded (status ${response.status}).`);
	}

	return response.blob();
}

/**
 * Tells Unsplash that a photo was used, which its API guidelines require. Fire and forget:
 * the photo is already on the canvas, so a failure here must never surface to the person drawing.
 */
export function reportUnsplashDownload(downloadLocation: string) {
	void fetch("/api/unsplash/download", {
		method: "POST",
		credentials: "omit",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ downloadLocation }),
		keepalive: true,
	}).catch(() => undefined);
}
