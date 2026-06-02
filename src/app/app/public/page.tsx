import { Suspense } from "react";

import { AppSectionClient } from "@/components/app-section-client";

export default function PublicPage() {
	return (
		<Suspense fallback={<div className="min-h-screen bg-background" />}>
			<AppSectionClient section="public" />
		</Suspense>
	);
}

