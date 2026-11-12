import type { Metadata } from "next";
import { Suspense } from "react";

import { EditorClient } from "@/components/editor-client";
import { humanizeSlug } from "@/lib/sketchflow";

type SketchPageProps = {
	params: Promise<{ workspaceId: string; projectId: string; sketchId: string }>;
};

// The project's real title lives in the browser or the repository, so the server can only
// name the tab from the URL. The editor replaces it with the real title once it has loaded.
export async function generateMetadata({ params }: SketchPageProps): Promise<Metadata> {
	const { projectId } = await params;
	return { title: humanizeSlug(projectId) || "Sketch", robots: { index: false, follow: false } };
}

export default async function SketchPage({ params }: SketchPageProps) {
	const { workspaceId, projectId, sketchId } = await params;

	return (
		<Suspense fallback={<div className="min-h-screen bg-background" />}>
			<EditorClient
				key={`${workspaceId}/${projectId}/${sketchId}`}
				workspaceId={workspaceId}
				projectId={projectId}
				sketchId={sketchId}
			/>
		</Suspense>
	);
}
