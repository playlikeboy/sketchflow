import type { Metadata } from "next";
import { Suspense } from "react";

import { AppSectionClient } from "@/components/app-section-client";

export const metadata: Metadata = { title: "Shared" };

export default function PublicPage() {
	return (
		<Suspense fallback={<div className="min-h-screen bg-background" />}>
			<AppSectionClient section="public" />
		</Suspense>
	);
}

