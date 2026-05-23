import Link from "next/link";
import { ExternalLink, GitBranch } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function safeSegment(value: string) {
	if (!/^[A-Za-z0-9_.-]+$/.test(value)) {
		throw new Error("Invalid path segment");
	}

	return value;
}

async function readPublicProject(owner: string, repo: string, projectId: string) {
	const url = `https://raw.githubusercontent.com/${safeSegment(owner)}/${safeSegment(repo)}/main/projects/${safeSegment(projectId)}/project.json`;
	const response = await fetch(url, { next: { revalidate: 60 } });

	if (!response.ok) {
		return null;
	}

	return (await response.json()) as { title?: string; visibility?: string; updatedAt?: string };
}

export default async function ShareProjectPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string; projectId: string }>;
}) {
	const { owner, repo, projectId } = await params;
	const project = await readPublicProject(owner, repo, projectId).catch(() => null);
	const title = project?.title || projectId;

	return (
		<main className="min-h-screen bg-background px-5 py-10">
			<div className="mx-auto max-w-3xl">
				<div className="mb-6 flex items-center justify-between gap-3">
					<Link href="/" className="flex items-center gap-2 text-sm font-semibold">
						<span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">SF</span>
						Sketchflow
					</Link>
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
