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
 * with the `ixid` tracking parameter Unsplash adds, and returns a URL rebuilt from the validated
 * parts so nothing else from the caller's string is ever requested.
 */
export function parseDownloadLocation(raw: unknown) {
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
	return `${UNSPLASH_API_ORIGIN}/photos/${path[1]}/download${query}`;
}

// ---- Response mapping ---------------------------------------------------------------------

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
export function mapUnsplashPhoto(raw: unknown): UnsplashPhoto | null {
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
export function mapUnsplashSearchResponse(raw: unknown): UnsplashSearchResponse {
	const body = asRecord(raw);
	const results = Array.isArray(body.results) ? body.results : [];
	const photos = results.map(mapUnsplashPhoto).filter((photo) => photo !== null);
	const totalPages = positiveNumber(body.total_pages) ?? (photos.length > 0 ? 1 : 0);

	return { photos, totalPages: Math.min(UNSPLASH_MAX_PAGE, Math.floor(totalPages)) };
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

export type UnsplashClientOptions = {
	fetch: UnsplashFetch;
	getAccessKey: () => string;
	now: () => number;
	timeoutMs: number;
};

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

/**
 * Builds an Unsplash client. The exported `searchUnsplashPhotos` and `trackUnsplashDownload`
 * use the real fetch and environment; tests build their own with a mocked fetch.
 */
export function createUnsplashClient(overrides: Partial<UnsplashClientOptions> = {}) {
	const options = { ...defaultOptions(), ...overrides };
	// Per-isolate memory cache in front of Next's fetch cache, which is not persisted on every host.
	const searchCache = new Map<string, CachedSearch>();

	async function requestJson(url: string, cache: RequestInit): Promise<unknown> {
		const accessKey = options.getAccessKey();
		if (!accessKey) {
			throw new UnsplashNotConfiguredError();
		}

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

	function rememberSearch(key: string, value: UnsplashSearchResponse) {
		searchCache.delete(key);
		if (searchCache.size >= MAX_CACHED_SEARCHES) {
			const oldestKey = searchCache.keys().next().value;
			if (oldestKey !== undefined) searchCache.delete(oldestKey);
		}
		searchCache.set(key, { expiresAt: options.now() + UNSPLASH_SEARCH_TTL_SECONDS * 1_000, value });
	}

	async function searchPhotos(input: { query: string; page: number }): Promise<UnsplashSearchResponse> {
		const query = normalizeUnsplashQuery(input.query) || UNSPLASH_DEFAULT_QUERY;
		const cacheKey = `${input.page}\n${query}`;
		const cached = searchCache.get(cacheKey);
		if (cached && cached.expiresAt > options.now()) {
			return cached.value;
		}

		const body = await requestJson(searchUrl(query, input.page), { next: { revalidate: UNSPLASH_SEARCH_TTL_SECONDS } });
		const result = mapUnsplashSearchResponse(body);
		rememberSearch(cacheKey, result);
		return result;
	}

	/** Reports a photo as used. `downloadLocation` is re-validated here, whatever the caller did. */
	async function trackDownload(downloadLocation: string): Promise<void> {
		await requestJson(parseDownloadLocation(downloadLocation), { cache: "no-store" });
	}

	return { searchPhotos, trackDownload };
}

const defaultClient = createUnsplashClient();

export const searchUnsplashPhotos = defaultClient.searchPhotos;
export const trackUnsplashDownload = defaultClient.trackDownload;

// ---- Route helpers ------------------------------------------------------------------------

/** These routes work signed out, so they are limited per visitor address instead of per user. */
export const UNSPLASH_RATE_LIMITS = {
	search: { limit: 30, windowMs: 60_000 },
	download: { limit: 30, windowMs: 60_000 },
} satisfies Record<string, RateLimitRule>;

const SHARED_RATE_LIMIT_KEY = "shared";
const checkRateLimit = createRateLimiter();

/**
 * The visitor's address as Cloudflare reports it. Anything that does not look like an IP
 * address (or a host without Cloudflare in front) falls back to one bucket shared by everyone.
 */
export function rateLimitKeyForRequest(request: Request) {
	const address = request.headers.get("cf-connecting-ip")?.trim() ?? "";
	return /^[0-9a-fA-F:.]{3,45}$/.test(address) ? address.toLowerCase() : SHARED_RATE_LIMIT_KEY;
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
