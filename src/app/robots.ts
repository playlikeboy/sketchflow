import type { MetadataRoute } from "next";

import { SKETCHFLOW_APP_URL } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
	return {
		rules: {
			userAgent: "*",
			allow: "/",
			disallow: ["/api/", "/sign-in"],
		},
		sitemap: `${SKETCHFLOW_APP_URL}/sitemap.xml`,
	};
}
