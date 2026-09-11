const CACHE_NAME = "sketchflow-static-v3";
const APP_PAGES = ["/app", "/app/recent", "/app/docs", "/app/templates", "/help"];
const STATIC_ASSETS = [
	"/favicon.ico",
	"/favicon.svg",
	"/logo.png",
	"/pwa-192.png",
	"/pwa-512.png",
	"/apple-touch-icon.png",
	"/og-image.png",
];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll([...STATIC_ASSETS, ...APP_PAGES]))
			.then(() => self.skipWaiting()),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
			.then(() => self.clients.claim()),
	);
});

self.addEventListener("fetch", (event) => {
	const request = event.request;
	const url = new URL(request.url);

	if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
		return;
	}

	// HTML Navigation requests (network first with cache fallback)
	if (request.mode === "navigate") {
		event.respondWith(
			fetch(request)
				.then((response) => {
					if (response.ok) {
						const copy = response.clone();
						caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
					}
					return response;
				})
				.catch(async () => {
					const cached = await caches.match(request);
					if (cached) return cached;
					const fallback = await caches.match("/app");
					if (fallback) return fallback;
					return new Response("Sketchflow is currently offline.", {
						status: 503,
						headers: { "Content-Type": "text/plain" },
					});
				}),
		);
		return;
	}

	// Static assets and scripts: Cache first
	event.respondWith(
		caches.match(request).then((cached) => {
			if (cached) return cached;

			return fetch(request).then((response) => {
				if (response.ok && (url.pathname.startsWith("/_next/static/") || STATIC_ASSETS.includes(url.pathname))) {
					const copy = response.clone();
					caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
				}

				return response;
			});
		}),
	);
});
