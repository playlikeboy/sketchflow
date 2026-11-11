export class CrossSiteRequestError extends Error {
	constructor() {
		super("Cross-site requests are not allowed");
		this.name = "CrossSiteRequestError";
	}
}

// Browsers always send Origin on cross-site POSTs, so a mutating request whose Origin is not
// this app is rejected. Requests without an Origin (same-origin GET-style clients, curl) pass.
export function assertSameOrigin(request: Request) {
	if (request.headers.get("sec-fetch-site") === "cross-site") {
		throw new CrossSiteRequestError();
	}

	const origin = request.headers.get("origin");
	if (!origin) {
		return;
	}

	let originHost: string;
	try {
		originHost = new URL(origin).host;
	} catch {
		throw new CrossSiteRequestError();
	}

	const allowedHosts = new Set<string>();
	const hostHeader = request.headers.get("host");
	if (hostHeader) allowedHosts.add(hostHeader);
	try {
		allowedHosts.add(new URL(request.url).host);
	} catch {
		// ignore unparsable request URLs
	}

	if (!allowedHosts.has(originHost)) {
		throw new CrossSiteRequestError();
	}
}
