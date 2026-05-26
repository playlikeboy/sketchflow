import Link from "next/link";

import { PublicSketchViewer } from "@/components/public-sketch-viewer";
import { Badge } from "@/components/ui/badge";
import { getPublicRepoDefaultBranch, readPublicProject, readPublicSketch } from "@/server/public-github";

export default async function EmbedProjectPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string; projectId: string }>;
}) {
	const { owner, repo, projectId } = await params;
	const branch = await getPublicRepoDefaultBranch(owner, repo);
	const project = await readPublicProject({ owner, repo, branch, projectId }).catch(() => null);
	const scene = await readPublicSketch({ owner, repo, branch, projectId, project }).catch(() => null);

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
