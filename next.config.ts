import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	compress: true,
	async headers() {
		const baseHeaders = [
			{ key: "X-Content-Type-Options", value: "nosniff" },
			{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
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
