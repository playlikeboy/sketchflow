import { Suspense } from "react";

import { ProjectsHomeClient } from "@/components/projects-home-client";

export default function AppPage() {
	return (
		<Suspense fallback={<div className="min-h-screen bg-background" />}>
			<ProjectsHomeClient />
		</Suspense>
	);
}
