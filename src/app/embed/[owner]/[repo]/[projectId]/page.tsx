import Link from "next/link";

import { PublicSketchViewer } from "@/components/public-sketch-viewer";
import { Badge } from "@/components/ui/badge";
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

export default async function EmbedProjectPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string; projectId: string }>;
}) {
	const { owner, repo, projectId } = await params;
	const project = await readPublicProject(owner, repo, projectId).catch(() => null);
	const scene = await readPublicSketch(owner, repo, projectId, project).catch(() => null);

	return (
		<main className="min-h-screen bg-background p-4">
			<div className="flex h-full min-h-[520px] flex-col rounded-xl border bg-card p-4">
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
					<PublicSketchViewer scene={scene} />
				</div>
				<Link className="mt-3 inline-flex text-xs text-primary" href={`/share/${owner}/${repo}/${projectId}`} target="_blank">
					Open share page
				</Link>
			</div>
		</main>
	);
}
