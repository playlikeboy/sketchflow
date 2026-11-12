import type { Metadata } from "next";
import { Suspense } from "react";

import { ProjectsHomeClient } from "@/components/projects-home-client";

export const metadata: Metadata = { title: "Projects" };

export default function AppPage() {
	return (
		<Suspense fallback={<div className="min-h-screen bg-background" />}>
			<ProjectsHomeClient />
		</Suspense>
	);
}
