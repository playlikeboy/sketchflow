import { expect, test } from "bun:test";

import { arrangeInColumns, classifyUnsplashFailure as classifyClientFailure, normalizeUnsplashQuery, unsplashSearchPath } from "../src/lib/unsplash";
import { BadRequestError } from "../src/server/errors";
import {
	UNSPLASH_DEFAULT_QUERY,
	UnsplashNotConfiguredError,
	UnsplashRateLimitedError,
	UnsplashUpstreamError,
	checkUnsplashRateLimit,
	classifyUnsplashFailure,
	createUnsplashClient,
	mapUnsplashPhoto,
	mapUnsplashSearchResponse,
	parseDownloadLocation,
	parseSearchPage,
	parseSearchQuery,
	rateLimitKeyForRequest,
	withUnsplashReferral,
	type UnsplashFetch,
} from "../src/server/unsplash";
import { createRateLimiter } from "../src/server/rate-limit";

const TEST_KEY = "test-access-key";
const DOWNLOAD_LOCATION = "https://api.unsplash.com/photos/q10VITrVYUM/download?ixid=M3w3Nzg5OTl8MHwxfHNlYXJjaHwx";

function rawPhoto(overrides: Record<string, unknown> = {}) {
	return {
		id: "q10VITrVYUM",
		width: 4518,
		height: 3388,
		color: "#f3f3f3",
		description: null,
		alt_description: "pen near black lined paper and eyeglasses",
		urls: {
			raw: "https://images.unsplash.com/photo-1542435503-956c469947f6?ixid=abc",
			regular: "https://images.unsplash.com/photo-1542435503-956c469947f6?ixid=abc&w=1080",
			small: "https://images.unsplash.com/photo-1542435503-956c469947f6?ixid=abc&w=400",
		},
		links: {
			html: "https://unsplash.com/photos/pen-near-black-lined-paper-and-eyeglasses-q10VITrVYUM",
			download: "https://unsplash.com/photos/q10VITrVYUM/download?ixid=abc",
			download_location: DOWNLOAD_LOCATION,
		},
		user: {
			name: "Jess Bailey",
			username: "jessbaileydesigns",
			links: { html: "https://unsplash.com/@jessbaileydesigns" },
		},
		likes: 12,
		sponsorship: null,
		...overrides,
	};
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
	return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init });
}

type RecordedCall = { url: string; init: RequestInit };

function recordingFetch(respond: (call: RecordedCall) => Response | Promise<Response>) {
	const calls: RecordedCall[] = [];
	const fetch: UnsplashFetch = async (url, init) => {
		const call = { url, init };
		calls.push(call);
		return respond(call);
	};
	return { calls, fetch };
}

function silenceConsoleError() {
	const original = console.error;
	console.error = () => undefined;
	return () => {
		console.error = original;
	};
}

// ---- Result mapping -----------------------------------------------------------------------

test("maps an Unsplash result to the small shape sent to the browser", () => {
	expect(mapUnsplashPhoto(rawPhoto())).toEqual({
		id: "q10VITrVYUM",
		description: "pen near black lined paper and eyeglasses",
		width: 4518,
		height: 3388,
		color: "#f3f3f3",
		thumbUrl: "https://images.unsplash.com/photo-1542435503-956c469947f6?ixid=abc&w=400",
		regularUrl: "https://images.unsplash.com/photo-1542435503-956c469947f6?ixid=abc&w=1080",
		photographerName: "Jess Bailey",
		photographerUrl: "https://unsplash.com/@jessbaileydesigns?utm_source=sketchflow&utm_medium=referral",
		photoPageUrl:
			"https://unsplash.com/photos/pen-near-black-lined-paper-and-eyeglasses-q10VITrVYUM?utm_source=sketchflow&utm_medium=referral",
		downloadLocation: DOWNLOAD_LOCATION,
	});
});

test("prefers alt_description, then description, then an empty string", () => {
	expect(mapUnsplashPhoto(rawPhoto({ alt_description: null, description: "A tidy desk" }))?.description).toBe("A tidy desk");
	expect(mapUnsplashPhoto(rawPhoto({ alt_description: null, description: null }))?.description).toBe("");
});

test("falls back to the username and to a neutral colour", () => {
	const photo = mapUnsplashPhoto(
		rawPhoto({ color: "red; background:url(x)", user: { username: "jess", links: { html: "https://unsplash.com/@jess" } } }),
	);

	expect(photo?.photographerName).toBe("jess");
	expect(photo?.color).toBe("#d4d4d4");
});

test("drops results that are malformed or point anywhere other than Unsplash", () => {
	const urls = rawPhoto().urls;
	const links = rawPhoto().links;

	expect(mapUnsplashPhoto(null)).toBeNull();
	expect(mapUnsplashPhoto("photo")).toBeNull();
	expect(mapUnsplashPhoto(rawPhoto({ width: 0 }))).toBeNull();
	expect(mapUnsplashPhoto(rawPhoto({ urls: { ...urls, small: "https://plus.unsplash.com/premium_photo-1" } }))).toBeNull();
	expect(mapUnsplashPhoto(rawPhoto({ urls: { ...urls, regular: "https://evil.example/photo.jpg" } }))).toBeNull();
	expect(mapUnsplashPhoto(rawPhoto({ urls: { ...urls, small: "http://images.unsplash.com/photo-1" } }))).toBeNull();
	expect(mapUnsplashPhoto(rawPhoto({ links: { ...links, html: "javascript:alert(1)" } }))).toBeNull();
	expect(mapUnsplashPhoto(rawPhoto({ links: { ...links, download_location: "https://evil.example/photos/x/download" } }))).toBeNull();
	expect(mapUnsplashPhoto(rawPhoto({ user: { name: "Jess", links: { html: "https://evil.example/@jess" } } }))).toBeNull();
});

test("maps a search body, skipping bad results and capping the page count", () => {
	const result = mapUnsplashSearchResponse({ total: 3998, total_pages: 167, results: [rawPhoto(), { id: "broken" }] });

	expect(result.photos).toHaveLength(1);
	expect(result.totalPages).toBe(20);
	expect(mapUnsplashSearchResponse({ total: 0, total_pages: 0, results: [] })).toEqual({ photos: [], totalPages: 0 });
	expect(mapUnsplashSearchResponse("not json")).toEqual({ photos: [], totalPages: 0 });
});

test("adds the referral parameters without losing existing ones", () => {
	expect(withUnsplashReferral("https://unsplash.com/@jess")).toBe("https://unsplash.com/@jess?utm_source=sketchflow&utm_medium=referral");
	expect(withUnsplashReferral("https://unsplash.com/photos/x?foo=1&utm_source=other")).toBe(
		"https://unsplash.com/photos/x?foo=1&utm_source=sketchflow&utm_medium=referral",
	);
});

// ---- Query and page validation ------------------------------------------------------------

test("normalizes a search query: control characters stripped, whitespace collapsed, lower case", () => {
	expect(parseSearchQuery("  Mountain\u0000\t LAKE\r\n ")).toBe("mountain lake");
	expect(parseSearchQuery(null)).toBe("");
	expect(parseSearchQuery("   ")).toBe("");
	expect(normalizeUnsplashQuery("Café\u0007 Table")).toBe("café table");
});

test("accepts a query of 100 characters and rejects a longer one", () => {
	expect(parseSearchQuery("a".repeat(100))).toHaveLength(100);
	expect(parseSearchQuery(`  ${"a".repeat(100)}  `)).toHaveLength(100);
	expect(() => parseSearchQuery("a".repeat(101))).toThrow(BadRequestError);
});

test("accepts whole pages from 1 to 20 and defaults to the first", () => {
	expect(parseSearchPage(null)).toBe(1);
	expect(parseSearchPage("")).toBe(1);
	expect(parseSearchPage("1")).toBe(1);
	expect(parseSearchPage("20")).toBe(20);
});

test("rejects pages that are out of range or not whole numbers", () => {
	for (const page of ["0", "21", "-1", "1.5", "1e1", "0x2", " 2", "two", "999999999999999999999"]) {
		expect(() => parseSearchPage(page)).toThrow(BadRequestError);
	}
});

test("builds the same search path for the same search however it was typed", () => {
	expect(unsplashSearchPath("  Mountain  LAKE ", 2)).toBe("/api/unsplash/search?q=mountain+lake&page=2");
	expect(unsplashSearchPath("mountain lake", 2)).toBe("/api/unsplash/search?q=mountain+lake&page=2");
});

// ---- Download location (the SSRF boundary) ------------------------------------------------

test("accepts the download location shape Unsplash returns", () => {
	expect(parseDownloadLocation(DOWNLOAD_LOCATION)).toBe(DOWNLOAD_LOCATION);
	expect(parseDownloadLocation("https://api.unsplash.com/photos/a-B_9/download")).toBe("https://api.unsplash.com/photos/a-B_9/download");
});

test("rejects download locations on other hosts, schemes, ports or paths", () => {
	const rejected: unknown[] = [
		"http://api.unsplash.com/photos/abc/download",
		"https://unsplash.com/photos/abc/download",
		"https://api.unsplash.com.evil.example/photos/abc/download",
		"https://evil.example/photos/abc/download",
		"https://api.unsplash.com@evil.example/photos/abc/download",
		"https://user:pass@api.unsplash.com/photos/abc/download",
		"https://api.unsplash.com:8443/photos/abc/download",
		"https://api.unsplash.com/photos/abc",
		"https://api.unsplash.com/photos/abc/download/extra",
		"https://api.unsplash.com/photos/abc/../../me/download",
		"https://api.unsplash.com/photos/%2e%2e/download",
		"https://api.unsplash.com/photos/a/b/download",
		"https://api.unsplash.com/photos//download",
		"https://api.unsplash.com/users/abc/download",
		"https://api.unsplash.com/photos/abc/download?ixid=abc&client_id=stolen",
		"https://api.unsplash.com/photos/abc/download?url=https://evil.example",
		"https://api.unsplash.com/photos/abc/download?ixid=a&ixid=b",
		"https://api.unsplash.com/photos/abc/download?ixid=a%26b",
		"https://api.unsplash.com/photos/abc/download#fragment",
		"https://api.unsplash.com/photos/abc/download\n",
		"https://api.unsplash.com\\@evil.example/photos/abc/download",
		" https://api.unsplash.com/photos/abc/download",
		"//api.unsplash.com/photos/abc/download",
		"file:///etc/passwd",
		"javascript:alert(1)",
		`https://api.unsplash.com/photos/${"a".repeat(65)}/download`,
		`https://api.unsplash.com/photos/abc/download?ixid=${"a".repeat(2000)}`,
		"",
		null,
		undefined,
		42,
		{ href: DOWNLOAD_LOCATION },
	];

	for (const value of rejected) {
		expect(() => parseDownloadLocation(value)).toThrow(BadRequestError);
	}
});

// ---- Error classification -----------------------------------------------------------------

test("classifies Unsplash failures", () => {
	expect(classifyUnsplashFailure(403, "0")).toBeInstanceOf(UnsplashRateLimitedError);
	expect(classifyUnsplashFailure(429, "0")).toBeInstanceOf(UnsplashRateLimitedError);
	expect(classifyUnsplashFailure(429, null)).toBeInstanceOf(UnsplashRateLimitedError);
	expect(classifyUnsplashFailure(403, "12")).toBeInstanceOf(UnsplashUpstreamError);
	expect(classifyUnsplashFailure(403, null)).toBeInstanceOf(UnsplashUpstreamError);
	expect(classifyUnsplashFailure(401, null)).toBeInstanceOf(UnsplashUpstreamError);
	expect(classifyUnsplashFailure(500, "0")).toBeInstanceOf(UnsplashUpstreamError);
});

test("gives each failure its own status and code", () => {
	expect([new UnsplashNotConfiguredError().status, new UnsplashNotConfiguredError().code]).toEqual([503, "unsplash_not_configured"]);
	expect([new UnsplashRateLimitedError().status, new UnsplashRateLimitedError().code]).toEqual([429, "unsplash_rate_limited"]);
	expect([new UnsplashUpstreamError().status, new UnsplashUpstreamError().code]).toEqual([502, "unsplash_unavailable"]);
});

test("classifies failed responses from the app's own routes for the tab", () => {
	expect(classifyClientFailure(503, "unsplash_not_configured")).toBe("not_configured");
	expect(classifyClientFailure(429, "unsplash_rate_limited")).toBe("rate_limited");
	expect(classifyClientFailure(429, "rate_limited")).toBe("rate_limited");
	expect(classifyClientFailure(502, "unsplash_unavailable")).toBe("failed");
	expect(classifyClientFailure(500)).toBe("failed");
});

// ---- Client (mocked fetch, no network) ----------------------------------------------------

test("searches with the key in the Authorization header and the documented parameters", async () => {
	const { calls, fetch } = recordingFetch(() => jsonResponse({ total: 1, total_pages: 3, results: [rawPhoto()] }));
	const client = createUnsplashClient({ fetch, getAccessKey: () => TEST_KEY });

	const result = await client.searchPhotos({ query: "Mountain Lake", page: 2 });

	expect(result.totalPages).toBe(3);
	expect(result.photos.map((photo) => photo.id)).toEqual(["q10VITrVYUM"]);
	expect(calls).toHaveLength(1);
	expect(calls[0].url).toBe("https://api.unsplash.com/search/photos?query=mountain+lake&page=2&per_page=24&content_filter=high");
	expect(calls[0].url).not.toContain(TEST_KEY);
	expect(new Headers(calls[0].init.headers).get("authorization")).toBe(`Client-ID ${TEST_KEY}`);
	expect(new Headers(calls[0].init.headers).get("accept-version")).toBe("v1");
	expect(calls[0].init.redirect).toBe("error");
	expect((calls[0].init as { next?: { revalidate?: number } }).next?.revalidate).toBe(3600);
	expect(JSON.stringify(result)).not.toContain(TEST_KEY);
});

test("an empty search uses the default query", async () => {
	const { calls, fetch } = recordingFetch(() => jsonResponse({ total_pages: 1, results: [rawPhoto()] }));
	const client = createUnsplashClient({ fetch, getAccessKey: () => TEST_KEY });

	await client.searchPhotos({ query: "   ", page: 1 });

	expect(new URL(calls[0].url).searchParams.get("query")).toBe(UNSPLASH_DEFAULT_QUERY);
});

test("repeated searches are served from memory until they expire", async () => {
	let now = 0;
	const { calls, fetch } = recordingFetch(() => jsonResponse({ total_pages: 1, results: [rawPhoto()] }));
	const client = createUnsplashClient({ fetch, getAccessKey: () => TEST_KEY, now: () => now });

	await client.searchPhotos({ query: "desk", page: 1 });
	await client.searchPhotos({ query: " DESK ", page: 1 });
	expect(calls).toHaveLength(1);

	await client.searchPhotos({ query: "desk", page: 2 });
	expect(calls).toHaveLength(2);

	now += 3_600_001;
	await client.searchPhotos({ query: "desk", page: 1 });
	expect(calls).toHaveLength(3);
});

test("without a key nothing is requested and the failure says so", async () => {
	const { calls, fetch } = recordingFetch(() => jsonResponse({}));
	const client = createUnsplashClient({ fetch, getAccessKey: () => "" });

	await expect(client.searchPhotos({ query: "desk", page: 1 })).rejects.toBeInstanceOf(UnsplashNotConfiguredError);
	await expect(client.trackDownload(DOWNLOAD_LOCATION)).rejects.toBeInstanceOf(UnsplashNotConfiguredError);
	expect(calls).toHaveLength(0);
});

test("reports Unsplash's rate limit, and does not cache or leak the failure", async () => {
	const restore = silenceConsoleError();
	try {
		const { calls, fetch } = recordingFetch(
			() => new Response(`Rate Limit Exceeded for ${TEST_KEY}`, { status: 403, headers: { "X-Ratelimit-Remaining": "0" } }),
		);
		const client = createUnsplashClient({ fetch, getAccessKey: () => TEST_KEY });

		const failure = await client.searchPhotos({ query: "desk", page: 1 }).catch((error: unknown) => error);
		await client.searchPhotos({ query: "desk", page: 1 }).catch(() => undefined);

		expect(failure).toBeInstanceOf(UnsplashRateLimitedError);
		expect((failure as Error).message).not.toContain(TEST_KEY);
		expect((failure as Error).message).not.toContain("Rate Limit Exceeded");
		expect(calls).toHaveLength(2);
	} finally {
		restore();
	}
});

test("turns upstream errors, network errors and bad JSON into an upstream failure", async () => {
	const restore = silenceConsoleError();
	try {
		const responders = [
			() => new Response("oops", { status: 500 }),
			() => new Response("unauthorized", { status: 401 }),
			() => new Response("<html>not json</html>", { status: 200 }),
			() => {
				throw new TypeError(`fetch failed for Client-ID ${TEST_KEY}`);
			},
		];

		for (const respond of responders) {
			const client = createUnsplashClient({ fetch: recordingFetch(respond).fetch, getAccessKey: () => TEST_KEY });
			const failure = await client.searchPhotos({ query: "desk", page: 1 }).catch((error: unknown) => error);

			expect(failure).toBeInstanceOf(UnsplashUpstreamError);
			expect((failure as Error).message).not.toContain(TEST_KEY);
		}
	} finally {
		restore();
	}
});

test("gives up on a request that takes too long", async () => {
	const restore = silenceConsoleError();
	try {
		const fetch: UnsplashFetch = (_url, init) =>
			new Promise((_resolve, reject) => {
				init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
			});
		const client = createUnsplashClient({ fetch, getAccessKey: () => TEST_KEY, timeoutMs: 5 });

		await expect(client.searchPhotos({ query: "desk", page: 1 })).rejects.toBeInstanceOf(UnsplashUpstreamError);
	} finally {
		restore();
	}
});

test("tracks a download by requesting only the validated Unsplash URL", async () => {
	const { calls, fetch } = recordingFetch(() => jsonResponse({ url: "https://images.unsplash.com/photo-1" }));
	const client = createUnsplashClient({ fetch, getAccessKey: () => TEST_KEY });

	await client.trackDownload(DOWNLOAD_LOCATION);

	expect(calls.map((call) => call.url)).toEqual([DOWNLOAD_LOCATION]);
	expect(new Headers(calls[0].init.headers).get("authorization")).toBe(`Client-ID ${TEST_KEY}`);
	expect(calls[0].init.cache).toBe("no-store");
	expect(calls[0].init.redirect).toBe("error");
});

test("never requests a download location that is not Unsplash's", async () => {
	const { calls, fetch } = recordingFetch(() => jsonResponse({}));
	const client = createUnsplashClient({ fetch, getAccessKey: () => TEST_KEY });

	await expect(client.trackDownload("https://evil.example/photos/abc/download")).rejects.toBeInstanceOf(BadRequestError);
	await expect(client.trackDownload("http://169.254.169.254/latest/meta-data")).rejects.toBeInstanceOf(BadRequestError);
	expect(calls).toHaveLength(0);
});

// ---- Route helpers ------------------------------------------------------------------------

test("rate limits by the visitor address Cloudflare reports, with one shared fallback bucket", () => {
	const request = (headers: Record<string, string>) => new Request("https://sketchflow.test/api/unsplash/search", { headers });

	expect(rateLimitKeyForRequest(request({ "cf-connecting-ip": "203.0.113.7" }))).toBe("203.0.113.7");
	expect(rateLimitKeyForRequest(request({ "cf-connecting-ip": "2001:DB8::1" }))).toBe("2001:db8::1");
	expect(rateLimitKeyForRequest(request({}))).toBe("shared");
	expect(rateLimitKeyForRequest(request({ "cf-connecting-ip": "not an address" }))).toBe("shared");
	expect(rateLimitKeyForRequest(request({ "x-forwarded-for": "203.0.113.7" }))).toBe("shared");
});

test("allows 30 searches a minute per visitor, then asks them to wait", () => {
	const check = createRateLimiter(() => 0);
	const visitor = new Request("https://sketchflow.test/api/unsplash/search", { headers: { "cf-connecting-ip": "203.0.113.7" } });
	const other = new Request("https://sketchflow.test/api/unsplash/search", { headers: { "cf-connecting-ip": "203.0.113.8" } });

	for (let attempt = 0; attempt < 30; attempt += 1) {
		expect(checkUnsplashRateLimit("search", visitor, check).allowed).toBe(true);
	}

	expect(checkUnsplashRateLimit("search", visitor, check)).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
	expect(checkUnsplashRateLimit("search", other, check).allowed).toBe(true);
	expect(checkUnsplashRateLimit("download", visitor, check).allowed).toBe(true);
});

// ---- Grid layout --------------------------------------------------------------------------

test("deals photos into the shortest column, and appending never moves earlier photos", () => {
	const photos = [
		{ id: "tall", width: 100, height: 300 },
		{ id: "wide", width: 300, height: 100 },
		{ id: "square", width: 100, height: 100 },
		{ id: "wide-2", width: 300, height: 100 },
	];

	const firstPage = arrangeInColumns(photos.slice(0, 3), 2).map((column) => column.map((photo) => photo.id));
	const bothPages = arrangeInColumns(photos, 2).map((column) => column.map((photo) => photo.id));

	expect(firstPage).toEqual([["tall"], ["wide", "square"]]);
	expect(bothPages).toEqual([["tall"], ["wide", "square", "wide-2"]]);
	expect(arrangeInColumns([], 2)).toEqual([[], []]);
});
