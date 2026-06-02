import { Suspense } from "react";

import { AppSectionClient } from "@/components/app-section-client";

export default function RecentPage() {
	return (
		<Suspense fallback={<div className="min-h-screen bg-background" />}>
			<AppSectionClient section="recent" />
		</Suspense>
	);
}

