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
				src: "/pwa-192.png",
				sizes: "192x192",
				type: "image/png",
			},
			{
				src: "/pwa-512.png",
				sizes: "512x512",
				type: "image/png",
			},
			{
				src: "/logo.png",
				sizes: "512x512",
				type: "image/png",
				purpose: "maskable",
			},
		],
	};
}
