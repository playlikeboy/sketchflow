const CACHE_NAME = "sketchflow-static-v2";
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
			.then((cache) => cache.addAll(STATIC_ASSETS))
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
