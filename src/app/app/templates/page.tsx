import { Suspense } from "react";

import { AppSectionClient } from "@/components/app-section-client";

export default function TemplatesPage() {
	return (
		<Suspense fallback={<div className="min-h-screen bg-background" />}>
			<AppSectionClient section="templates" />
		</Suspense>
	);
}

