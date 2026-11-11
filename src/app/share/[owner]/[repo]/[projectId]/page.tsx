import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, GitBranch } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { PublicSketchViewer } from "@/components/public-sketch-viewer";
import { TitleBlock, TitleBlockRow } from "@/components/title-block";
import { Button } from "@/components/ui/button";
import { loadPublicProjectView } from "@/server/public-github";

type PageProps = {
	params: Promise<{ owner: string; repo: string; projectId: string }>;
	searchParams: Promise<{ ref?: string }>;
};

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
	const { owner, repo, projectId } = await params;
	const { ref } = await searchParams;
	const view = await loadPublicProjectView(owner, repo, projectId, ref, "share");
	if (!view) {
		return { title: "Project not found", robots: { index: false } };
	}

	const title = view.project?.title || projectId;
	return {
		title,
		description: `${title} — a public Sketchflow project from ${owner}/${repo}.`,
	};
}

export default async function ShareProjectPage({
	params,
	searchParams,
}: {
	params: Promise<{ owner: string; repo: string; projectId: string }>;
	searchParams: Promise<{ ref?: string }>;
}) {
	const { owner, repo, projectId } = await params;
	const { ref } = await searchParams;
	const view = await loadPublicProjectView(owner, repo, projectId, ref, "share");
	if (!view) {
		notFound();
	}
	const { branch, project, scene } = view;
	const title = project?.title || projectId;

	const revised = project?.updatedAt ? new Date(project.updatedAt) : null;
	const revisedLabel =
		revised && !Number.isNaN(revised.getTime())
			? revised.toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
			: null;

	return (
		<div className="min-h-screen bg-background">
			<header className="border-b border-border">
				<div className="mx-auto flex h-12 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
					<BrandMark />
					<Button variant="outline" size="sm" asChild>
						<Link href="/">What is Sketchflow?</Link>
					</Button>
				</div>
			</header>

			<main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
				<div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end">
					<div>
						<h1 className="text-3xl font-bold tracking-tight">{title}</h1>
						<p className="mt-2 max-w-[60ch] text-sm text-muted-foreground">
							A read-only view of a sketch that lives in a public GitHub repository. Pan and zoom freely; nothing
							you do here changes the original.
						</p>
					</div>
					<TitleBlock>
						<TitleBlockRow label="Repository" mono>{owner}/{repo}</TitleBlockRow>
						<TitleBlockRow label="Folder" mono>projects/{projectId}</TitleBlockRow>
						<TitleBlockRow label="Version" mono>{branch.length === 40 ? branch.slice(0, 7) : branch}</TitleBlockRow>
						{revisedLabel ? <TitleBlockRow label="Revised">{revisedLabel}</TitleBlockRow> : null}
					</TitleBlock>
				</div>

				<PublicSketchViewer scene={scene} className="mt-6 h-[min(70vh,44rem)] w-full" />

				<div className="mt-4 flex flex-wrap gap-2">
					<Button asChild>
						<Link
							href={`https://github.com/${owner}/${repo}/tree/${branch}/projects/${projectId}`}
							target="_blank"
							rel="noopener noreferrer"
						>
							<GitBranch />
							View files on GitHub
						</Link>
					</Button>
					<Button variant="outline" asChild>
						<Link href={`/embed/${owner}/${repo}/${projectId}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`} target="_blank">
							<ExternalLink />
							Open embed view
						</Link>
					</Button>
				</div>
			</main>
		</div>
	);
}
