import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicSketchViewer } from "@/components/public-sketch-viewer";
import { SheetMark } from "@/components/brand-mark";
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
		<main className="flex h-screen w-screen flex-col overflow-hidden bg-background">
			<div className="min-h-0 flex-1">
				<PublicSketchViewer scene={scene} className="h-full w-full rounded-none border-0" />
			</div>
			<footer className="flex h-9 shrink-0 items-center justify-between gap-3 border-t border-border bg-card px-3 text-xs">
				<span className="min-w-0 truncate">
					<span className="font-semibold text-foreground">{project?.title || projectId}</span>
					<span className="datum ml-2 text-muted-foreground">{owner}/{repo}</span>
				</span>
				<Link
					className="inline-flex shrink-0 items-center gap-1.5 font-medium text-primary underline"
					href={`/share/${owner}/${repo}/${projectId}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`}
					target="_blank"
				>
					<SheetMark className="size-4" />
					Open in Sketchflow
				</Link>
			</footer>
		</main>
	);
}
