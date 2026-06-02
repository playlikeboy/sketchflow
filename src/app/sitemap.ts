import type { MetadataRoute } from "next";

import { SKETCHFLOW_APP_URL } from "@/lib/config";

export default function sitemap(): MetadataRoute.Sitemap {
	const now = new Date();

	return [
		{
			url: SKETCHFLOW_APP_URL,
			lastModified: now,
			changeFrequency: "weekly",
			priority: 1,
		},
		{
			url: `${SKETCHFLOW_APP_URL}/app`,
			lastModified: now,
			changeFrequency: "daily",
			priority: 0.7,
		},
		{
			url: `${SKETCHFLOW_APP_URL}/help`,
			lastModified: now,
			changeFrequency: "monthly",
			priority: 0.5,
		},
	];
}
