import type { MetadataRoute } from "next";

import { SKETCHFLOW_APP_URL } from "@/lib/config";

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "Sketchflow",
		short_name: "Sketchflow",
		description: "A canvas and a notes editor that save to a GitHub repository you own.",
		start_url: "/app",
		scope: "/",
		display: "standalone",
		background_color: "#f9fbfa",
		theme_color: "#1558a8",
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
