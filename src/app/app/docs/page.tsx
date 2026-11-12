import type { Metadata } from "next";
import { Suspense } from "react";

import { AppSectionClient } from "@/components/app-section-client";

export const metadata: Metadata = { title: "Notes" };

export default function DocsPage() {
	return (
		<Suspense fallback={<div className="min-h-screen bg-background" />}>
			<AppSectionClient section="docs" />
		</Suspense>
	);
}

