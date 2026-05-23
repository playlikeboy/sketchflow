import { Suspense } from "react";

import { EditorClient } from "@/components/editor-client";

export default async function SketchPage({
	params,
}: {
	params: Promise<{ workspaceId: string; projectId: string; sketchId: string }>;
}) {
	const { workspaceId, projectId, sketchId } = await params;

	return (
		<Suspense fallback={<div className="min-h-screen bg-background" />}>
			<EditorClient workspaceId={workspaceId} projectId={projectId} sketchId={sketchId} />
		</Suspense>
	);
}
