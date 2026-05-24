import Link from "next/link";
import { ExternalLink, GitBranch } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { PublicSketchViewer } from "@/components/public-sketch-viewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SketchScene } from "@/lib/api";

type PublicProject = {
	title?: string;
	visibility?: string;
	updatedAt?: string;
	sketches?: Array<{ id?: string; title?: string; file?: string }>;
};

function safeSegment(value: string) {
	if (!/^[A-Za-z0-9_.-]+$/.test(value)) {
		throw new Error("Invalid path segment");
	}

	return value;
}

function safePath(value: string) {
	if (!/^[A-Za-z0-9_./-]+$/.test(value) || value.includes("..") || value.startsWith("/")) {
		throw new Error("Invalid GitHub path");
	}

	return value;
}

async function readPublicJson<T>(owner: string, repo: string, path: string) {
	const url = `https://raw.githubusercontent.com/${safeSegment(owner)}/${safeSegment(repo)}/main/${safePath(path)}`;
	const response = await fetch(url, { next: { revalidate: 60 } });

	if (!response.ok) {
		return null;
	}

	return (await response.json()) as T;
}

async function readPublicProject(owner: string, repo: string, projectId: string) {
	return readPublicJson<PublicProject>(owner, repo, `projects/${safeSegment(projectId)}/project.json`);
}

async function readPublicSketch(owner: string, repo: string, projectId: string, project: PublicProject | null) {
	const firstSketch = project?.sketches?.[0];
	const sketchPath = firstSketch?.file || `projects/${safeSegment(projectId)}/sketches/system-map.excalidraw.json`;

	return readPublicJson<SketchScene>(owner, repo, sketchPath);
}

export default async function ShareProjectPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string; projectId: string }>;
}) {
	const { owner, repo, projectId } = await params;
	const project = await readPublicProject(owner, repo, projectId).catch(() => null);
	const scene = await readPublicSketch(owner, repo, projectId, project).catch(() => null);
	const title = project?.title || projectId;

	return (
		<main className="min-h-screen bg-background px-5 py-10">
			<div className="mx-auto max-w-5xl">
				<div className="mb-6 flex items-center justify-between gap-3">
					<BrandMark />
					<Badge variant="secondary" className="font-normal">
						Public project
					</Badge>
				</div>

				<Card>
					<CardHeader>
						<CardTitle className="text-2xl">{title}</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<p className="text-sm text-muted-foreground">
							This project is served from the owner&apos;s GitHub workspace repo.
						</p>
						<div className="rounded-lg border bg-muted/20 p-3 font-mono text-xs text-muted-foreground">
							{owner}/{repo}/projects/{projectId}
						</div>
						<PublicSketchViewer scene={scene} />
						<div className="flex flex-wrap gap-2">
							<Button asChild>
								<Link href={`https://github.com/${owner}/${repo}/tree/main/projects/${projectId}`} target="_blank">
									<GitBranch className="size-4" />
									View source
								</Link>
							</Button>
							<Button variant="outline" asChild>
								<Link href={`/embed/${owner}/${repo}/${projectId}`} target="_blank">
									<ExternalLink className="size-4" />
									Embed view
								</Link>
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		</main>
	);
}
