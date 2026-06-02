import { Suspense } from "react";

import { DashboardClient } from "@/components/dashboard-client";

export default function WorkspacePage() {
	return (
		<Suspense fallback={<div className="min-h-screen bg-background" />}>
			<DashboardClient />
		</Suspense>
	);
}
