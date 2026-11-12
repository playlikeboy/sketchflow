import { expect, test } from "bun:test";

import { arrangeInColumns, classifyUnsplashFailure as classifyClientFailure, normalizeUnsplashQuery, unsplashSearchPath } from "../src/lib/unsplash";
import { BadRequestError, HttpError } from "../src/server/errors";
import { createRateLimiter, type RateLimitRule } from "../src/server/rate-limit";
import {
	UNSPLASH_DEFAULT_QUERY,
	UNSPLASH_SHARED_VISITOR_KEY,
	UNSPLASH_UPSTREAM_LIMITS,
	UnsplashNotConfiguredError,
	UnsplashRateLimitedError,
	UnsplashUpstreamError,
	checkUnsplashRateLimit,
	classifyUnsplashFailure,
	createDownloadToken,
	createUnsplashClient,
	mapUnsplashPhoto,
	mapUnsplashSearchResponse,
	parseDownloadLocation,
	parseDownloadTarget,
	parseSearchPage,
	parseSearchQuery,
	rateLimitKeyForRequest,
	signUnsplashSearchResponse,
	verifyDownloadToken,
	withUnsplashReferral,
	type UnsplashClientOptions,
	type UnsplashFetch,
	type UnsplashUpstreamLimits,
} from "../src/server/unsplash";

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

const HOUR_MS = 3_600_000;
const VISITOR = "203.0.113.7";
const OTHER_VISITOR = "203.0.113.8";
const ROOMY: RateLimitRule = { limit: 10_000, windowMs: HOUR_MS };
const ROOMY_LIMITS: UnsplashUpstreamLimits = { visitorSearchMisses: ROOMY, globalSearchMisses: ROOMY, downloads: ROOMY };

function searchBody() {
	return { total: 1, total_pages: 3, results: [rawPhoto()] };
}

function downloadLocationFor(photoId: string) {
	return `https://api.unsplash.com/photos/${photoId}/download?ixid=abc`;
}

async function signedDownload(photoId: string) {
	return { downloadLocation: downloadLocationFor(photoId), downloadToken: await createDownloadToken(photoId, TEST_KEY) };
}

function testClient(respond: (call: RecordedCall) => Response | Promise<Response>, overrides: Partial<UnsplashClientOptions> = {}) {
	const { calls, fetch } = recordingFetch(respond);
	return { calls, client: createUnsplashClient({ fetch, getAccessKey: () => TEST_KEY, limits: ROOMY_LIMITS, ...overrides }) };
}

test("searches with the key in the Authorization header and the documented parameters", async () => {
	const { calls, client } = testClient(() => jsonResponse(searchBody()));

	const result = await client.searchPhotos({ query: "Mountain Lake", page: 2, visitorKey: VISITOR });

	expect(result.totalPages).toBe(3);
	expect(result.photos.map((photo) => photo.id)).toEqual(["q10VITrVYUM"]);
	expect(calls).toHaveLength(1);
	expect(calls[0].url).toBe("https://api.unsplash.com/search/photos?query=mountain+lake&page=2&per_page=24&content_filter=high");
	expect(calls[0].url).not.toContain(TEST_KEY);
	expect(new Headers(calls[0].init.headers).get("authorization")).toBe(`Client-ID ${TEST_KEY}`);
	expect(new Headers(calls[0].init.headers).get("accept-version")).toBe("v1");
	expect(calls[0].init.redirect).toBe("manual");
	expect((calls[0].init as { next?: { revalidate?: number } }).next?.revalidate).toBe(3600);
	expect(JSON.stringify(result)).not.toContain(TEST_KEY);
});

test("an empty search uses the default query", async () => {
	const { calls, client } = testClient(() => jsonResponse(searchBody()));

	await client.searchPhotos({ query: "   ", page: 1, visitorKey: VISITOR });

	expect(new URL(calls[0].url).searchParams.get("query")).toBe(UNSPLASH_DEFAULT_QUERY);
});

test("repeated searches are served from memory until they expire", async () => {
	let now = 0;
	const { calls, client } = testClient(() => jsonResponse(searchBody()), { now: () => now });

	await client.searchPhotos({ query: "desk", page: 1, visitorKey: VISITOR });
	await client.searchPhotos({ query: " DESK ", page: 1, visitorKey: VISITOR });
	expect(calls).toHaveLength(1);

	await client.searchPhotos({ query: "desk", page: 2, visitorKey: VISITOR });
	expect(calls).toHaveLength(2);

	now += HOUR_MS + 1;
	await client.searchPhotos({ query: "desk", page: 1, visitorKey: VISITOR });
	expect(calls).toHaveLength(3);
});

test("signing adds a token to every photo and leaves the mapped result untouched", async () => {
	const mapped = mapUnsplashSearchResponse(searchBody());
	const signed = await signUnsplashSearchResponse(mapped, TEST_KEY);

	expect(mapped.photos[0]).not.toHaveProperty("downloadToken");
	expect(signed.totalPages).toBe(mapped.totalPages);
	expect(signed.photos).toEqual([{ ...mapped.photos[0], downloadToken: await createDownloadToken("q10VITrVYUM", TEST_KEY) }]);
});

test("search results carry a download token for each photo, cached or not", async () => {
	const { client } = testClient(() => jsonResponse(searchBody()));
	const expected = await createDownloadToken("q10VITrVYUM", TEST_KEY);

	const fresh = await client.searchPhotos({ query: "desk", page: 1, visitorKey: VISITOR });
	const cached = await client.searchPhotos({ query: "desk", page: 1, visitorKey: OTHER_VISITOR });

	expect(fresh.photos[0].downloadToken).toBe(expected);
	expect(cached.photos[0].downloadToken).toBe(expected);
});

test("without a key nothing is requested and the failure says so", async () => {
	const { calls, fetch } = recordingFetch(() => jsonResponse({}));
	const client = createUnsplashClient({ fetch, getAccessKey: () => "" });

	await expect(client.searchPhotos({ query: "desk", page: 1, visitorKey: VISITOR })).rejects.toBeInstanceOf(UnsplashNotConfiguredError);
	await expect(client.trackDownload(await signedDownload("abc"))).rejects.toBeInstanceOf(UnsplashNotConfiguredError);
	expect(calls).toHaveLength(0);
});

test("reports Unsplash's rate limit, and does not cache or leak the failure", async () => {
	const restore = silenceConsoleError();
	try {
		const { calls, client } = testClient(
			() => new Response(`Rate Limit Exceeded for ${TEST_KEY}`, { status: 403, headers: { "X-Ratelimit-Remaining": "0" } }),
		);

		const failure = await client.searchPhotos({ query: "desk", page: 1, visitorKey: VISITOR }).catch((error: unknown) => error);
		await client.searchPhotos({ query: "desk", page: 1, visitorKey: VISITOR }).catch(() => undefined);

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
			const { client } = testClient(respond);
			const failure = await client.searchPhotos({ query: "desk", page: 1, visitorKey: VISITOR }).catch((error: unknown) => error);

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

		await expect(client.searchPhotos({ query: "desk", page: 1, visitorKey: VISITOR })).rejects.toBeInstanceOf(UnsplashUpstreamError);
	} finally {
		restore();
	}
});

// ---- Upstream budget (only cache misses are charged) --------------------------------------

test("leaves room in Unsplash's 50 an hour for searches and download reports together", () => {
	const { visitorSearchMisses, globalSearchMisses, downloads } = UNSPLASH_UPSTREAM_LIMITS;

	expect(globalSearchMisses.limit + downloads.limit).toBeLessThanOrEqual(50);
	expect(visitorSearchMisses.limit).toBeLessThan(globalSearchMisses.limit);
	expect([visitorSearchMisses.windowMs, globalSearchMisses.windowMs, downloads.windowMs]).toEqual([HOUR_MS, HOUR_MS, HOUR_MS]);
});

test("cache hits are never charged or refused, even with every budget spent", async () => {
	const spent: RateLimitRule = { limit: 1, windowMs: HOUR_MS };
	const { calls, client } = testClient(() => jsonResponse(searchBody()), {
		limits: { ...ROOMY_LIMITS, visitorSearchMisses: spent, globalSearchMisses: spent },
	});

	const first = await client.searchPhotos({ query: "desk", page: 1, visitorKey: VISITOR });
	for (let repeat = 0; repeat < 40; repeat += 1) {
		const visitorKey = repeat % 2 === 0 ? VISITOR : `198.51.100.${repeat}`;
		expect(await client.searchPhotos({ query: "desk", page: 1, visitorKey })).toBe(first);
	}

	expect(calls).toHaveLength(1);
	// The budgets really are spent: a search that is not cached is refused.
	await expect(client.searchPhotos({ query: "chair", page: 1, visitorKey: OTHER_VISITOR })).rejects.toBeInstanceOf(UnsplashRateLimitedError);
	expect(calls).toHaveLength(1);
});

test("the per-visitor limit refuses that visitor's next uncached search, and resets after an hour", async () => {
	let now = 0;
	const { calls, client } = testClient(() => jsonResponse(searchBody()), {
		now: () => now,
		limits: { ...ROOMY_LIMITS, visitorSearchMisses: { limit: 2, windowMs: HOUR_MS } },
	});

	await client.searchPhotos({ query: "one", page: 1, visitorKey: VISITOR });
	await client.searchPhotos({ query: "two", page: 1, visitorKey: VISITOR });
	await expect(client.searchPhotos({ query: "three", page: 1, visitorKey: VISITOR })).rejects.toBeInstanceOf(UnsplashRateLimitedError);
	expect(calls).toHaveLength(2);

	// Someone else is unaffected, and their result is then free for the limited visitor too.
	await client.searchPhotos({ query: "three", page: 1, visitorKey: OTHER_VISITOR });
	await client.searchPhotos({ query: "three", page: 1, visitorKey: VISITOR });
	expect(calls).toHaveLength(3);

	now += HOUR_MS;
	await client.searchPhotos({ query: "four", page: 1, visitorKey: VISITOR });
	expect(calls).toHaveLength(4);
});

test("the isolate-wide limit refuses the next uncached search from anyone", async () => {
	const { calls, client } = testClient(() => jsonResponse(searchBody()), {
		limits: { ...ROOMY_LIMITS, globalSearchMisses: { limit: 2, windowMs: HOUR_MS } },
	});

	await client.searchPhotos({ query: "one", page: 1, visitorKey: "198.51.100.1" });
	await client.searchPhotos({ query: "two", page: 1, visitorKey: "198.51.100.2" });
	await expect(client.searchPhotos({ query: "three", page: 1, visitorKey: "198.51.100.3" })).rejects.toBeInstanceOf(UnsplashRateLimitedError);

	expect(calls).toHaveLength(2);
});

test("visitors without an address are held to the isolate-wide limit only", async () => {
	const { calls, client } = testClient(() => jsonResponse(searchBody()), {
		limits: { ...ROOMY_LIMITS, visitorSearchMisses: { limit: 1, windowMs: HOUR_MS }, globalSearchMisses: { limit: 3, windowMs: HOUR_MS } },
	});

	for (const query of ["one", "two", "three"]) {
		await client.searchPhotos({ query, page: 1, visitorKey: UNSPLASH_SHARED_VISITOR_KEY });
	}
	await expect(client.searchPhotos({ query: "four", page: 1, visitorKey: UNSPLASH_SHARED_VISITOR_KEY })).rejects.toBeInstanceOf(
		UnsplashRateLimitedError,
	);

	expect(calls).toHaveLength(3);
});

test("a refused search serves the expired copy when there is one", async () => {
	let now = 0;
	const { calls, client } = testClient(() => jsonResponse(searchBody()), {
		now: () => now,
		limits: { ...ROOMY_LIMITS, visitorSearchMisses: { limit: 1, windowMs: 10 * HOUR_MS } },
	});

	const first = await client.searchPhotos({ query: "desk", page: 1, visitorKey: VISITOR });
	now += HOUR_MS + 1;

	expect(await client.searchPhotos({ query: "desk", page: 1, visitorKey: VISITOR })).toBe(first);
	await expect(client.searchPhotos({ query: "chair", page: 1, visitorKey: VISITOR })).rejects.toBeInstanceOf(UnsplashRateLimitedError);
	expect(calls).toHaveLength(1);
});

test("a failed or rate-limited search serves the expired copy when there is one", async () => {
	const restore = silenceConsoleError();
	try {
		const failures = [
			() => new Response("oops", { status: 500 }),
			() => new Response("Rate Limit Exceeded", { status: 403, headers: { "X-Ratelimit-Remaining": "0" } }),
			() => {
				throw new TypeError("fetch failed");
			},
		];

		for (const fail of failures) {
			let now = 0;
			let isFailing = false;
			const { calls, client } = testClient(() => (isFailing ? fail() : jsonResponse(searchBody())), { now: () => now });

			const first = await client.searchPhotos({ query: "desk", page: 1, visitorKey: VISITOR });
			now += HOUR_MS + 1;
			isFailing = true;

			expect(await client.searchPhotos({ query: "desk", page: 1, visitorKey: VISITOR })).toBe(first);
			expect(calls).toHaveLength(2);
			// Nothing to fall back on for a search that was never cached.
			await expect(client.searchPhotos({ query: "chair", page: 1, visitorKey: VISITOR })).rejects.toBeInstanceOf(HttpError);
		}
	} finally {
		restore();
	}
});

test("the default first page is never evicted, so the empty search box stays free", async () => {
	const { calls, client } = testClient(() => jsonResponse(searchBody()));

	await client.searchPhotos({ query: "", page: 1, visitorKey: VISITOR });
	for (let index = 0; index < 250; index += 1) {
		await client.searchPhotos({ query: `filler ${index}`, page: 1, visitorKey: VISITOR });
	}
	expect(calls).toHaveLength(251);

	await client.searchPhotos({ query: "", page: 1, visitorKey: VISITOR });
	expect(calls).toHaveLength(251);

	// Ordinary entries are still evicted oldest first.
	await client.searchPhotos({ query: "filler 0", page: 1, visitorKey: VISITOR });
	expect(calls).toHaveLength(252);
});

// ---- Download tokens and tracking ---------------------------------------------------------

test("a download token is stable for a photo, and differs by photo and by key", async () => {
	const token = await createDownloadToken("q10VITrVYUM", TEST_KEY);

	expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
	expect(await createDownloadToken("q10VITrVYUM", TEST_KEY)).toBe(token);
	expect(await createDownloadToken("nvzvOPQW0gc", TEST_KEY)).not.toBe(token);
	expect(await createDownloadToken("q10VITrVYUM", "another-access-key")).not.toBe(token);
	expect(token).not.toContain(TEST_KEY);
});

test("verifies only the token issued for that photo with the current key", async () => {
	const token = await createDownloadToken("q10VITrVYUM", TEST_KEY);
	const otherPhotoToken = await createDownloadToken("nvzvOPQW0gc", TEST_KEY);
	const otherKeyToken = await createDownloadToken("q10VITrVYUM", "another-access-key");

	expect(await verifyDownloadToken("q10VITrVYUM", token, TEST_KEY)).toBe(true);
	for (const wrong of [undefined, null, "", 42, [token], otherPhotoToken, otherKeyToken, token.slice(0, 21), `${token}A`, "A".repeat(22)]) {
		expect(await verifyDownloadToken("q10VITrVYUM", wrong, TEST_KEY)).toBe(false);
	}
});

test("reads the photo id out of a download location", () => {
	expect(parseDownloadTarget(DOWNLOAD_LOCATION)).toEqual({ photoId: "q10VITrVYUM", url: DOWNLOAD_LOCATION });
	expect(() => parseDownloadTarget("https://evil.example/photos/q10VITrVYUM/download")).toThrow(BadRequestError);
});

test("tracks a download by requesting only the validated Unsplash URL", async () => {
	const { calls, client } = testClient(() => jsonResponse({ url: "https://images.unsplash.com/photo-1" }));

	const outcome = await client.trackDownload(await signedDownload("q10VITrVYUM"));

	expect(outcome).toBe("tracked");
	expect(calls.map((call) => call.url)).toEqual([downloadLocationFor("q10VITrVYUM")]);
	expect(new Headers(calls[0].init.headers).get("authorization")).toBe(`Client-ID ${TEST_KEY}`);
	expect(calls[0].init.cache).toBe("no-store");
	expect(calls[0].init.redirect).toBe("manual");
});

test("a token handed out with a search result is accepted for that photo", async () => {
	const { calls, client } = testClient((call) => jsonResponse(call.url.includes("/search/") ? searchBody() : { url: "x" }));

	const [photo] = (await client.searchPhotos({ query: "desk", page: 1, visitorKey: VISITOR })).photos;

	expect(await client.trackDownload(photo)).toBe("tracked");
	expect(calls).toHaveLength(2);
	expect(calls[1].url).toBe(DOWNLOAD_LOCATION);
});

test("rejects a download with a missing, wrong or other photo's token, without calling Unsplash", async () => {
	const { calls, client } = testClient(() => jsonResponse({}));
	const downloadLocation = downloadLocationFor("q10VITrVYUM");
	const otherPhotoToken = await createDownloadToken("nvzvOPQW0gc", TEST_KEY);

	for (const downloadToken of [undefined, "", "A".repeat(22), otherPhotoToken, 7]) {
		await expect(client.trackDownload({ downloadLocation, downloadToken })).rejects.toBeInstanceOf(BadRequestError);
	}
	expect(calls).toHaveLength(0);
});

test("never requests a download location that is not Unsplash's", async () => {
	const { calls, client } = testClient(() => jsonResponse({}));
	const downloadToken = await createDownloadToken("abc", TEST_KEY);

	for (const downloadLocation of ["https://evil.example/photos/abc/download", "http://169.254.169.254/latest/meta-data", undefined]) {
		await expect(client.trackDownload({ downloadLocation, downloadToken })).rejects.toBeInstanceOf(BadRequestError);
	}
	expect(calls).toHaveLength(0);
});

test("a repeated download of the same photo reaches Unsplash once a day", async () => {
	let now = 0;
	const { calls, client } = testClient(() => jsonResponse({}), { now: () => now });
	const download = await signedDownload("q10VITrVYUM");

	expect(await client.trackDownload(download)).toBe("tracked");
	expect(await client.trackDownload(download)).toBe("already_tracked");
	// The same photo with a different tracking parameter is still the same photo.
	expect(await client.trackDownload({ ...download, downloadLocation: "https://api.unsplash.com/photos/q10VITrVYUM/download" })).toBe(
		"already_tracked",
	);
	expect(calls).toHaveLength(1);

	now += 24 * HOUR_MS + 1;
	expect(await client.trackDownload(download)).toBe("tracked");
	expect(calls).toHaveLength(2);
});

test("an exhausted download budget answers without calling Unsplash, until the hour is up", async () => {
	let now = 0;
	const { calls, client } = testClient(() => jsonResponse({}), {
		now: () => now,
		limits: { ...ROOMY_LIMITS, downloads: { limit: 2, windowMs: HOUR_MS } },
	});

	expect(await client.trackDownload(await signedDownload("photo-1"))).toBe("tracked");
	expect(await client.trackDownload(await signedDownload("photo-2"))).toBe("tracked");
	expect(await client.trackDownload(await signedDownload("photo-3"))).toBe("over_budget");
	expect(calls).toHaveLength(2);

	now += HOUR_MS;
	expect(await client.trackDownload(await signedDownload("photo-3"))).toBe("tracked");
	expect(calls).toHaveLength(3);
});

test("a download report that failed can be sent again", async () => {
	const restore = silenceConsoleError();
	try {
		let isFailing = true;
		const { calls, client } = testClient(() => (isFailing ? new Response("oops", { status: 500 }) : jsonResponse({})));
		const download = await signedDownload("q10VITrVYUM");

		await expect(client.trackDownload(download)).rejects.toBeInstanceOf(UnsplashUpstreamError);
		isFailing = false;

		expect(await client.trackDownload(download)).toBe("tracked");
		expect(calls).toHaveLength(2);
	} finally {
		restore();
	}
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

// Cloudflare Workers throw a TypeError for `redirect: "error"`, which took photo search down
// in production while every local test passed. These pin the option that works there.
test("asks for redirects to be returned, not followed and not thrown, so the request works on Workers", async () => {
	const { calls, client } = testClient(() => jsonResponse(searchBody()));

	await client.searchPhotos({ query: "harbour", page: 1, visitorKey: VISITOR });

	expect(calls[0].init.redirect).toBe("manual");
	expect(calls[0].init.redirect).not.toBe("error");
});

test("treats a redirect from Unsplash as a failure and never requests its target", async () => {
	const { calls, client } = testClient(() => new Response(null, { status: 302, headers: { location: "https://evil.example/steal" } }));

	const attempt = client.searchPhotos({ query: "lighthouse", page: 1, visitorKey: VISITOR });

	await expect(attempt).rejects.toBeInstanceOf(UnsplashUpstreamError);
	expect(calls).toHaveLength(1);
	expect(calls[0].url.startsWith("https://api.unsplash.com/")).toBe(true);
});
