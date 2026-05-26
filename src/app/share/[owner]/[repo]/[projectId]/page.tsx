import Link from "next/link";
import { ExternalLink, GitBranch } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { PublicSketchViewer } from "@/components/public-sketch-viewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPublicRepoDefaultBranch, readPublicProject, readPublicSketch } from "@/server/public-github";

export default async function ShareProjectPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string; projectId: string }>;
}) {
	const { owner, repo, projectId } = await params;
	const branch = await getPublicRepoDefaultBranch(owner, repo);
	const project = await readPublicProject({ owner, repo, branch, projectId }).catch(() => null);
	const scene = await readPublicSketch({ owner, repo, branch, projectId, project }).catch(() => null);
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
								<Link href={`https://github.com/${owner}/${repo}/tree/${branch}/projects/${projectId}`} target="_blank">
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
