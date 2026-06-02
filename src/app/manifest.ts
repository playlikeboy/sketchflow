import type { MetadataRoute } from "next";

import { SKETCHFLOW_APP_URL } from "@/lib/config";

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "Sketchflow",
		short_name: "Sketchflow",
		description: "GitHub-native visual workspace for sketches, docs, diagrams, and project memory.",
		start_url: "/app",
		scope: "/",
		display: "standalone",
		background_color: "#111111",
		theme_color: "#52e000",
		id: SKETCHFLOW_APP_URL,
		icons: [
			{
				src: "/favicon.svg",
				sizes: "any",
				type: "image/svg+xml",
			},
			{
				src: "/pwa-icon.svg",
				sizes: "512x512",
				type: "image/svg+xml",
				purpose: "maskable",
			},
		],
	};
}
