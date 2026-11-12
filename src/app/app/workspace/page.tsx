import type { Metadata } from "next";
import { Suspense } from "react";

import { WorkspaceClient } from "@/components/workspace-client";

export const metadata: Metadata = { title: "Workspaces" };

export default function WorkspacePage() {
	return (
		<Suspense fallback={<div className="min-h-screen bg-background" />}>
			<WorkspaceClient />
		</Suspense>
	);
}
