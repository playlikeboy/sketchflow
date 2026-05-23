import { Suspense } from "react";

import { DashboardClient } from "@/components/dashboard-client";

export default function AppPage() {
	return (
		<Suspense fallback={<div className="min-h-screen bg-background" />}>
			<DashboardClient />
		</Suspense>
	);
}
