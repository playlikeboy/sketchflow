// Server side of the Insert panel's Photos tab: talks to the Unsplash API with the access key,
// and hands the browser a small, validated shape. Kept free of server-only imports so it can be
// unit tested; the key is only ever read from the server environment.

import {
	UNSPLASH_IMAGE_ORIGIN,
	UNSPLASH_MAX_PAGE,
	UNSPLASH_MAX_QUERY_LENGTH,
	UNSPLASH_REFERRAL_PARAMS,
	normalizeUnsplashQuery,
	type UnsplashPhoto,
	type UnsplashSearchResponse,
} from "@/lib/unsplash";
import { getOptionalEnv } from "@/server/env";
import { BadRequestError, HttpError } from "@/server/errors";
import { createRateLimiter, type RateLimitResult, type RateLimitRule } from "@/server/rate-limit";

const UNSPLASH_API_ORIGIN = "https://api.unsplash.com";
const UNSPLASH_SITE_ORIGIN = "https://unsplash.com";
const SEARCH_PAGE_SIZE = 24;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_DOWNLOAD_LOCATION_LENGTH = 1_024;
const MAX_TEXT_LENGTH = 300;
const MAX_NAME_LENGTH = 120;
const FALLBACK_COLOR = "#d4d4d4";

/** How long a search result is reused. The demo tier allows only 50 Unsplash requests an hour. */
export const UNSPLASH_SEARCH_TTL_SECONDS = 3_600;
const MAX_CACHED_SEARCHES = 200;

/**
 * What an empty search box shows. A fixed search (rather than Unsplash's editorial feed) keeps
 * one code path and one response shape, and `content_filter=high` still applies to it.
 */
export const UNSPLASH_DEFAULT_QUERY = "minimal workspace";

export class UnsplashNotConfiguredError extends HttpError {
	readonly code = "unsplash_not_configured" as const;

	constructor() {
		super("Photo search is not set up on this server.", 503);
		this.name = "UnsplashNotConfiguredError";
	}
}

export class UnsplashRateLimitedError extends HttpError {
	readonly code = "unsplash_rate_limited" as const;

	constructor() {
		super("Photo search is busy. Try again in a few minutes.", 429);
		this.name = "UnsplashRateLimitedError";
	}
}

export class UnsplashUpstreamError extends HttpError {
	readonly code = "unsplash_unavailable" as const;

	constructor() {
		super("Photo search is temporarily unavailable.", 502);
		this.name = "UnsplashUpstreamError";
	}
}

// ---- Request validation -------------------------------------------------------------------

/** Validates the `q` parameter. An absent or blank query is allowed and means "the default". */
export function parseSearchQuery(raw: string | null) {
	const query = normalizeUnsplashQuery(raw ?? "");
	if (query.length > UNSPLASH_MAX_QUERY_LENGTH) {
		throw new BadRequestError(`Expected "q" to be at most ${UNSPLASH_MAX_QUERY_LENGTH} characters`);
	}
	return query;
}

/** Validates the `page` parameter: a whole number from 1 to UNSPLASH_MAX_PAGE, defaulting to 1. */
export function parseSearchPage(raw: string | null) {
	if (raw === null || raw === "") return 1;

	const page = /^\d{1,3}$/.test(raw) ? Number(raw) : Number.NaN;
	if (!Number.isInteger(page) || page < 1 || page > UNSPLASH_MAX_PAGE) {
		throw new BadRequestError(`Expected "page" to be a whole number from 1 to ${UNSPLASH_MAX_PAGE}`);
	}
	return page;
}

const DOWNLOAD_PATH_PATTERN = /^\/photos\/([A-Za-z0-9_-]{1,64})\/download$/;
const DOWNLOAD_IXID_PATTERN = /^[A-Za-z0-9_-]{1,512}$/;

/**
 * The SSRF boundary. Accepts only `https://api.unsplash.com/photos/<id>/download`, optionally
 * with the `ixid` tracking parameter Unsplash adds, and returns the photo id with a URL rebuilt
 * from the validated parts, so nothing else from the caller's string is ever requested.
 */
export function parseDownloadTarget(raw: unknown): { photoId: string; url: string } {
	const invalid = () => new BadRequestError('Expected "downloadLocation" to be an Unsplash download URL');

	if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_DOWNLOAD_LOCATION_LENGTH) {
		throw invalid();
	}
	// Reject anything the URL parser would quietly tidy up (whitespace, backslashes, control characters).
	if (!raw.startsWith(`${UNSPLASH_API_ORIGIN}/photos/`) || /[\s\\\p{Cc}]/u.test(raw)) {
		throw invalid();
	}

	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw invalid();
	}

	const path = DOWNLOAD_PATH_PATTERN.exec(url.pathname);
	const params = [...url.searchParams.entries()];
	const ixid = url.searchParams.get("ixid");
	const hasOnlyIxid = params.every(([key]) => key === "ixid") && params.length <= 1;

	if (url.origin !== UNSPLASH_API_ORIGIN || url.username || url.password || url.hash || !path || !hasOnlyIxid) {
		throw invalid();
	}
	if (ixid !== null && !DOWNLOAD_IXID_PATTERN.test(ixid)) {
		throw invalid();
	}

	const query = ixid === null ? "" : `?ixid=${ixid}`;
	return { photoId: path[1], url: `${UNSPLASH_API_ORIGIN}/photos/${path[1]}/download${query}` };
}

/** The validated, rebuilt download URL on its own. */
export function parseDownloadLocation(raw: unknown) {
	return parseDownloadTarget(raw).url;
}

// ---- Download tokens ----------------------------------------------------------------------

// A token proves that this server handed out a photo in a search result. Without one, the
// download route would track any photo id a script cared to send, spending the shared Unsplash
// budget and inventing download counts. It is the first 16 bytes of
// HMAC-SHA256(access key, "sketchflow:unsplash-download:v1:<photo id>"), base64url encoded.
const DOWNLOAD_TOKEN_CONTEXT = "sketchflow:unsplash-download:v1:";
const DOWNLOAD_TOKEN_BYTES = 16;
const DOWNLOAD_TOKEN_LENGTH = 22;
const textEncoder = new TextEncoder();

function importSigningKey(accessKey: string) {
	return crypto.subtle.importKey("raw", textEncoder.encode(accessKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

function toBase64Url(bytes: Uint8Array) {
	return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function signPhotoId(signingKey: CryptoKey, photoId: string) {
	const signature = await crypto.subtle.sign("HMAC", signingKey, textEncoder.encode(`${DOWNLOAD_TOKEN_CONTEXT}${photoId}`));
	return toBase64Url(new Uint8Array(signature).slice(0, DOWNLOAD_TOKEN_BYTES));
}

export async function createDownloadToken(photoId: string, accessKey: string) {
	return signPhotoId(await importSigningKey(accessKey), photoId);
}

function constantTimeEqual(left: string, right: string) {
	if (left.length !== right.length) return false;

	let difference = 0;
	for (let index = 0; index < left.length; index += 1) {
		difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
	}
	return difference === 0;
}

/** True only for the token this server issued for exactly this photo id. */
export async function verifyDownloadToken(photoId: string, token: unknown, accessKey: string) {
	if (typeof token !== "string" || token.length !== DOWNLOAD_TOKEN_LENGTH) return false;
	return constantTimeEqual(await createDownloadToken(photoId, accessKey), token);
}

// ---- Response mapping ---------------------------------------------------------------------

/** A mapped photo before its download token is attached. */
export type UnsignedUnsplashPhoto = Omit<UnsplashPhoto, "downloadToken">;

export type UnsignedUnsplashSearchResponse = {
	photos: UnsignedUnsplashPhoto[];
	totalPages: number;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): JsonRecord {
	return isRecord(value) ? value : {};
}

function text(value: unknown, maxLength: number) {
	return typeof value === "string" ? value.replace(/\p{Cc}+/gu, " ").trim().slice(0, maxLength) : "";
}

function positiveNumber(value: unknown) {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function urlOnOrigin(value: unknown, origin: string) {
	if (typeof value !== "string") return null;
	try {
		const url = new URL(value);
		return url.origin === origin && !url.username && !url.password ? url : null;
	} catch {
		return null;
	}
}

/** Adds the referral parameters Unsplash requires on every link back to its site. */
export function withUnsplashReferral(url: URL | string) {
	const result = new URL(url);
	for (const [key, value] of Object.entries(UNSPLASH_REFERRAL_PARAMS)) {
		result.searchParams.set(key, value);
	}
	return result.toString();
}

function safeDownloadLocation(value: unknown) {
	try {
		return parseDownloadLocation(value);
	} catch {
		return null;
	}
}

/**
 * Maps one raw Unsplash result to the shape sent to the browser, or null when it is missing
 * anything the tab needs. Photos served from other hosts (Unsplash+ previews) are left out.
 */
export function mapUnsplashPhoto(raw: unknown): UnsignedUnsplashPhoto | null {
	if (!isRecord(raw)) return null;

	const urls = asRecord(raw.urls);
	const links = asRecord(raw.links);
	const user = asRecord(raw.user);
	const id = text(raw.id, 64);
	const width = positiveNumber(raw.width);
	const height = positiveNumber(raw.height);
	const thumbUrl = urlOnOrigin(urls.small, UNSPLASH_IMAGE_ORIGIN);
	const regularUrl = urlOnOrigin(urls.regular, UNSPLASH_IMAGE_ORIGIN);
	const photoPageUrl = urlOnOrigin(links.html, UNSPLASH_SITE_ORIGIN);
	const photographerUrl = urlOnOrigin(asRecord(user.links).html, UNSPLASH_SITE_ORIGIN);
	const photographerName = text(user.name, MAX_NAME_LENGTH) || text(user.username, MAX_NAME_LENGTH);
	const downloadLocation = safeDownloadLocation(links.download_location);

	if (!id || !width || !height || !thumbUrl || !regularUrl || !photoPageUrl || !photographerUrl) return null;
	if (!photographerName || !downloadLocation) return null;

	const color = text(raw.color, 9);

	return {
		id,
		description: text(raw.alt_description, MAX_TEXT_LENGTH) || text(raw.description, MAX_TEXT_LENGTH),
		width,
		height,
		color: /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : FALLBACK_COLOR,
		thumbUrl: thumbUrl.toString(),
		regularUrl: regularUrl.toString(),
		photographerName,
		photographerUrl: withUnsplashReferral(photographerUrl),
		photoPageUrl: withUnsplashReferral(photoPageUrl),
		downloadLocation,
	};
}

/** Maps a raw `/search/photos` body. Malformed results are dropped rather than failing the page. */
export function mapUnsplashSearchResponse(raw: unknown): UnsignedUnsplashSearchResponse {
	const body = asRecord(raw);
	const results = Array.isArray(body.results) ? body.results : [];
	const photos = results.map(mapUnsplashPhoto).filter((photo) => photo !== null);
	const totalPages = positiveNumber(body.total_pages) ?? (photos.length > 0 ? 1 : 0);

	return { photos, totalPages: Math.min(UNSPLASH_MAX_PAGE, Math.floor(totalPages)) };
}

/** Attaches a download token to every photo. Kept apart from the mapping so that stays pure. */
export async function signUnsplashSearchResponse(
	response: UnsignedUnsplashSearchResponse,
	accessKey: string,
): Promise<UnsplashSearchResponse> {
	const signingKey = await importSigningKey(accessKey);
	const photos = await Promise.all(
		response.photos.map(async (photo) => ({
			...photo,
			downloadToken: await signPhotoId(signingKey, parseDownloadTarget(photo.downloadLocation).photoId),
		})),
	);
	return { photos, totalPages: response.totalPages };
}

// ---- Error classification -----------------------------------------------------------------

/**
 * Turns a failed Unsplash response into one of the errors above. Unsplash answers 403 (and
 * sometimes 429) with `X-Ratelimit-Remaining: 0` once the hourly budget is spent.
 */
export function classifyUnsplashFailure(status: number, rateLimitRemaining: string | null) {
	const budgetSpent = rateLimitRemaining !== null && rateLimitRemaining.trim() === "0";
	if (status === 429 || (status === 403 && budgetSpent)) {
		return new UnsplashRateLimitedError();
	}
	return new UnsplashUpstreamError();
}

// ---- Client -------------------------------------------------------------------------------

/** The part of `fetch` this module uses; narrower than the global so tests can pass a plain function. */
export type UnsplashFetch = (url: string, init: RequestInit) => Promise<Response>;

/** The key used when a request carries no usable visitor address. Everyone without one shares it. */
export const UNSPLASH_SHARED_VISITOR_KEY = "shared";

const HOUR_MS = 3_600_000;
const DOWNLOAD_DEDUPE_MS = 24 * HOUR_MS;
const MAX_TRACKED_DOWNLOADS = 2_000;

/**
 * Hourly ceilings on calls that actually reach Unsplash, whose demo tier allows 50 an hour for
 * the whole app. Only cache misses are charged; a cached search costs nothing and is never refused.
 */
export const UNSPLASH_UPSTREAM_LIMITS = {
	// Uncached searches by one visitor, so one person cannot spend everyone's budget.
	visitorSearchMisses: { limit: 12, windowMs: HOUR_MS },
	// Uncached searches by everyone this isolate serves.
	globalSearchMisses: { limit: 35, windowMs: HOUR_MS },
	// Download reports by everyone this isolate serves. 35 + 15 stays inside the 50.
	downloads: { limit: 15, windowMs: HOUR_MS },
} satisfies Record<string, RateLimitRule>;

export type UnsplashUpstreamLimits = Record<keyof typeof UNSPLASH_UPSTREAM_LIMITS, RateLimitRule>;

export type UnsplashClientOptions = {
	fetch: UnsplashFetch;
	getAccessKey: () => string;
	now: () => number;
	timeoutMs: number;
	limits: UnsplashUpstreamLimits;
};

/** What happened to a download report. Only "tracked" reached Unsplash. */
export type UnsplashDownloadOutcome = "tracked" | "already_tracked" | "over_budget";

// Finished results only. An in-flight promise must not be shared between requests on Cloudflare
// Workers, where I/O started by one request cannot be awaited from another.
type CachedSearch = {
	expiresAt: number;
	value: UnsplashSearchResponse;
};

function defaultOptions(): UnsplashClientOptions {
	return {
		// Looked up per call: Next.js replaces the global fetch with its caching one.
		fetch: (url, init) => fetch(url, init),
		getAccessKey: () => getOptionalEnv("UNSPLASH_ACCESS_KEY").trim(),
		now: Date.now,
		timeoutMs: REQUEST_TIMEOUT_MS,
		limits: UNSPLASH_UPSTREAM_LIMITS,
	};
}

function searchUrl(query: string, page: number) {
	const params = new URLSearchParams({
		query,
		page: String(page),
		per_page: String(SEARCH_PAGE_SIZE),
		content_filter: "high",
	});
	return `${UNSPLASH_API_ORIGIN}/search/photos?${params.toString()}`;
}

function searchCacheKey(query: string, page: number) {
	return `${page}\n${query}`;
}

// The empty search box shows this page. It is never evicted, so once loaded it stays free.
const PINNED_SEARCH_KEY = searchCacheKey(UNSPLASH_DEFAULT_QUERY, 1);

function isUpstreamTrouble(error: unknown) {
	return error instanceof UnsplashRateLimitedError || error instanceof UnsplashUpstreamError;
}

/**
 * Builds an Unsplash client. The exported `searchUnsplashPhotos` and `trackUnsplashDownload`
 * use the real fetch and environment; tests build their own with a mocked fetch, clock and limits.
 */
export function createUnsplashClient(overrides: Partial<UnsplashClientOptions> = {}) {
	const options = { ...defaultOptions(), ...overrides };
	// Per-isolate memory cache in front of Next's fetch cache, which is not persisted on every host.
	// Expired entries are kept until evicted: they are what gets served when Unsplash cannot be asked.
	const searchCache = new Map<string, CachedSearch>();
	// Photo id to the time it may be reported again.
	const trackedDownloads = new Map<string, number>();
	const spend = createRateLimiter(options.now);

	function requireAccessKey() {
		const accessKey = options.getAccessKey();
		if (!accessKey) {
			throw new UnsplashNotConfiguredError();
		}
		return accessKey;
	}

	async function requestJson(url: string, accessKey: string, cache: RequestInit): Promise<unknown> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), options.timeoutMs);
		try {
			const response = await options.fetch(url, {
				...cache,
				headers: { Authorization: `Client-ID ${accessKey}`, "Accept-Version": "v1", Accept: "application/json" },
				redirect: "error",
				signal: controller.signal,
			});
			if (!response.ok) {
				// The status only: upstream bodies and the key never reach logs or the browser.
				console.error(`Unsplash request failed with status ${response.status}`);
				throw classifyUnsplashFailure(response.status, response.headers.get("x-ratelimit-remaining"));
			}
			return await response.json();
		} catch (error) {
			if (error instanceof HttpError) throw error;
			console.error(`Unsplash request failed: ${error instanceof Error ? error.name : "unknown error"}`);
			throw new UnsplashUpstreamError();
		} finally {
			clearTimeout(timer);
		}
	}

	function evictOldestSearch() {
		for (const key of searchCache.keys()) {
			if (key !== PINNED_SEARCH_KEY) {
				searchCache.delete(key);
				return;
			}
		}
	}

	function rememberSearch(key: string, value: UnsplashSearchResponse) {
		searchCache.delete(key);
		if (searchCache.size >= MAX_CACHED_SEARCHES) {
			evictOldestSearch();
		}
		searchCache.set(key, { expiresAt: options.now() + UNSPLASH_SEARCH_TTL_SECONDS * 1_000, value });
	}

	/** Charges one uncached search to the visitor and to the isolate. False when either is spent. */
	function spendSearchMiss(visitorKey: string) {
		// Without a visitor address there is nobody to charge individually; the isolate-wide limit still applies.
		const isVisitorAllowed =
			visitorKey === UNSPLASH_SHARED_VISITOR_KEY || spend(`visitor-search:${visitorKey}`, options.limits.visitorSearchMisses).allowed;
		return isVisitorAllowed && spend("global-search", options.limits.globalSearchMisses).allowed;
	}

	async function searchPhotos(input: { query: string; page: number; visitorKey: string }): Promise<UnsplashSearchResponse> {
		const query = normalizeUnsplashQuery(input.query) || UNSPLASH_DEFAULT_QUERY;
		const cacheKey = searchCacheKey(query, input.page);
		const cached = searchCache.get(cacheKey);
		if (cached && cached.expiresAt > options.now()) {
			return cached.value;
		}

		const accessKey = requireAccessKey();
		if (!spendSearchMiss(input.visitorKey)) {
			if (cached) return cached.value;
			throw new UnsplashRateLimitedError();
		}

		try {
			const body = await requestJson(searchUrl(query, input.page), accessKey, { next: { revalidate: UNSPLASH_SEARCH_TTL_SECONDS } });
			const result = await signUnsplashSearchResponse(mapUnsplashSearchResponse(body), accessKey);
			rememberSearch(cacheKey, result);
			return result;
		} catch (error) {
			// An out-of-date page of photos is better than none while Unsplash is failing or limiting us.
			if (cached && isUpstreamTrouble(error)) return cached.value;
			throw error;
		}
	}

	function rememberDownload(photoId: string) {
		const now = options.now();
		if (trackedDownloads.size >= MAX_TRACKED_DOWNLOADS) {
			for (const [id, reportableAt] of trackedDownloads) {
				if (reportableAt <= now) trackedDownloads.delete(id);
			}
		}
		if (trackedDownloads.size >= MAX_TRACKED_DOWNLOADS) {
			const oldestId = trackedDownloads.keys().next().value;
			if (oldestId !== undefined) trackedDownloads.delete(oldestId);
		}
		trackedDownloads.set(photoId, now + DOWNLOAD_DEDUPE_MS);
	}

	/**
	 * Reports a photo as used, as Unsplash requires. Only photos this server handed out can be
	 * reported (the token), each at most once a day per isolate, within an hourly budget. A repeat
	 * or an exhausted budget is not an error: the caller fires and forgets this.
	 */
	async function trackDownload(input: { downloadLocation: unknown; downloadToken: unknown }): Promise<UnsplashDownloadOutcome> {
		const target = parseDownloadTarget(input.downloadLocation);
		const accessKey = requireAccessKey();
		if (!(await verifyDownloadToken(target.photoId, input.downloadToken, accessKey))) {
			throw new BadRequestError('Expected "downloadToken" to be the token issued with this photo');
		}

		if ((trackedDownloads.get(target.photoId) ?? 0) > options.now()) return "already_tracked";
		if (!spend("downloads", options.limits.downloads).allowed) return "over_budget";

		rememberDownload(target.photoId);
		try {
			await requestJson(target.url, accessKey, { cache: "no-store" });
			return "tracked";
		} catch (error) {
			// Not reported after all, so a later use of the same photo may try again.
			trackedDownloads.delete(target.photoId);
			throw error;
		}
	}

	return { searchPhotos, trackDownload };
}

const defaultClient = createUnsplashClient();

export const searchUnsplashPhotos = defaultClient.searchPhotos;
export const trackUnsplashDownload = defaultClient.trackDownload;

// ---- Route helpers ------------------------------------------------------------------------

/**
 * Burst control for the routes themselves, counted per request whether or not it is cached.
 * These routes work signed out, so they are limited per visitor address instead of per user.
 */
export const UNSPLASH_RATE_LIMITS = {
	search: { limit: 30, windowMs: 60_000 },
	download: { limit: 30, windowMs: 60_000 },
} satisfies Record<string, RateLimitRule>;

const checkRateLimit = createRateLimiter();

/**
 * The visitor's address as Cloudflare reports it. Anything that does not look like an IP
 * address (or a host without Cloudflare in front) falls back to one bucket shared by everyone.
 */
export function rateLimitKeyForRequest(request: Request) {
	const address = request.headers.get("cf-connecting-ip")?.trim() ?? "";
	return /^[0-9a-fA-F:.]{3,45}$/.test(address) ? address.toLowerCase() : UNSPLASH_SHARED_VISITOR_KEY;
}

export function checkUnsplashRateLimit(
	scope: keyof typeof UNSPLASH_RATE_LIMITS,
	request: Request,
	check: (key: string, rule: RateLimitRule) => RateLimitResult = checkRateLimit,
) {
	return check(`unsplash-${scope}:${rateLimitKeyForRequest(request)}`, UNSPLASH_RATE_LIMITS[scope]);
}

/** Marks a response as uncacheable, so an error is never stored where a search result belongs. */
export function withNoStore<T extends Response>(response: T) {
	response.headers.set("Cache-Control", "no-store");
	return response;
}
