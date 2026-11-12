import type { NextConfig } from "next";

const contentSecurityPolicy = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline' 'unsafe-eval'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob: https:",
	"font-src 'self' data: https://esm.sh https://unpkg.com",
	"connect-src 'self' https://api.github.com https://raw.githubusercontent.com https://cdn.jsdelivr.net https://esm.sh https://unpkg.com https://libraries.excalidraw.com https://images.unsplash.com",
	"worker-src 'self' blob:",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
	compress: true,
	async redirects() {
		// Sign-in pages of the previous auth provider lived under /handler; old links and
		// bookmarks land on the current sign-in page.
		return [{ source: "/handler/:path*", destination: "/sign-in", permanent: false }];
	},
	async headers() {
		const baseHeaders = [
			{ key: "X-Content-Type-Options", value: "nosniff" },
			{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
			{ key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
			// Report-only until it has been exercised against Excalidraw and BlockNote in
			// production; violations show up in the browser console without blocking anything.
			{ key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy },
		];

		return [
			// Embeds are meant to be framed by other sites; everything else must not be.
			{ source: "/embed/:path*", headers: baseHeaders },
			{
				source: "/((?!embed/).*)",
				headers: [
					...baseHeaders,
					{ key: "X-Frame-Options", value: "DENY" },
					{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
				],
			},
		];
	},
	experimental: {
		optimizePackageImports: ["lucide-react"],
	},
};

export default nextConfig;

// Enable calling `getCloudflareContext()` in `next dev`.
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
