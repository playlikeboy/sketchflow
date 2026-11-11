import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicSketchViewer } from "@/components/public-sketch-viewer";
import { Badge } from "@/components/ui/badge";
import { loadPublicProjectView } from "@/server/public-github";

type PageProps = {
	params: Promise<{ owner: string; repo: string; projectId: string }>;
	searchParams: Promise<{ ref?: string }>;
};

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
	const { owner, repo, projectId } = await params;
	const { ref } = await searchParams;
	const view = await loadPublicProjectView(owner, repo, projectId, ref, "embed");
	if (!view) {
		return { title: "Project not found", robots: { index: false } };
	}

	const title = view.project?.title || projectId;
	return {
		title,
		description: `${title} — a public Sketchflow project from ${owner}/${repo}.`,
		robots: { index: false },
	};
}

export default async function EmbedProjectPage({
	params,
	searchParams,
}: {
	params: Promise<{ owner: string; repo: string; projectId: string }>;
	searchParams: Promise<{ ref?: string }>;
}) {
	const { owner, repo, projectId } = await params;
	const { ref } = await searchParams;
	const view = await loadPublicProjectView(owner, repo, projectId, ref, "embed");
	if (!view) {
		notFound();
	}
	const { project, scene } = view;

	return (
		<main className="h-screen w-screen bg-background p-4 overflow-hidden">
			<div className="flex h-full w-full flex-col rounded-xl border bg-card p-4">
				<div className="mb-4 flex items-center justify-between gap-3">
					<div>
						<div className="text-sm font-semibold">{project?.title || projectId}</div>
						<div className="text-xs text-muted-foreground">
							{owner}/{repo}
						</div>
					</div>
					<Badge variant="secondary" className="font-normal">
						Sketchflow
					</Badge>
				</div>
				<div className="min-h-0 flex-1">
					<PublicSketchViewer scene={scene} className="h-full w-full" />
				</div>
				<Link className="mt-3 inline-flex text-xs text-primary" href={`/share/${owner}/${repo}/${projectId}`} target="_blank">
					Open share page
				</Link>
			</div>
		</main>
	);
}
