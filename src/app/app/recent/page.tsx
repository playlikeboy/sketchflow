import type { Metadata } from "next";
import { Suspense } from "react";

import { AppSectionClient } from "@/components/app-section-client";

export const metadata: Metadata = { title: "Recent" };

export default function RecentPage() {
	return (
		<Suspense fallback={<div className="min-h-screen bg-background" />}>
			<AppSectionClient section="recent" />
		</Suspense>
	);
}

