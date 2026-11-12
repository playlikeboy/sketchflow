import Link from "next/link";
import { ArrowUpRight, Code2, FileText, FolderOpen, Globe } from "lucide-react";

import { StateMark } from "@/components/state-mark";
import { Button } from "@/components/ui/button";
import type { Workspace } from "@/lib/api";
import { isLocalWorkspace } from "@/lib/local-workspace";
import type { WorkspaceProject } from "@/lib/project-metadata";
import {
	DEFAULT_SKETCH_ID,
	embedHref,
	repoFileHref,
	repoFolderHref,
	shareHref,
	sketchHref,
} from "@/lib/workspace-routes";

type ListWorkspace = Pick<Workspace, "id" | "repoOwner" | "repoName" | "defaultBranch" | "visibility">;

export function firstSketchId(project: WorkspaceProject) {
	return project.defaultSketchId || project.sketches[0]?.id || DEFAULT_SKETCH_ID;
}

export function formatRevised(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Unknown";
	return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Projects as ruled rows. Each row is the project's title block: its name, the folder it
 * lives in, when it was last revised, and whether it has reached GitHub.
 */
export function ProjectList({
	projects,
	workspace,
	primary = "sketch",
}: {
	projects: WorkspaceProject[];
	workspace: ListWorkspace;
	/** Which link the project name opens: the editor, or its notes file on GitHub. */
	primary?: "sketch" | "notes";
}) {
	return (
		<div className="overflow-x-auto rounded-lg border border-rule bg-card">
			<table className="w-full border-collapse text-sm">
				<thead>
					<tr className="border-b border-rule bg-muted text-left">
						<th scope="col" className="legend-label px-3 py-2 font-semibold">Project</th>
						<th scope="col" className="legend-label hidden px-3 py-2 font-semibold lg:table-cell">Folder</th>
						<th scope="col" className="legend-label hidden px-3 py-2 font-semibold sm:table-cell">Revised</th>
						<th scope="col" className="legend-label px-3 py-2 font-semibold">State</th>
						<th scope="col" className="hidden px-3 py-2 md:table-cell"><span className="sr-only">Links</span></th>
					</tr>
				</thead>
				<tbody>
					{projects.map((project) => {
						// The guest workspace has no repository: no GitHub links and no sharing.
						const onDevice = isLocalWorkspace(workspace.id);
						const canShare = !onDevice && workspace.visibility === "public" && project.visibility === "public";
						const editorHref = sketchHref(workspace.id, project.id, firstSketchId(project));
						const titleOpensGithub = primary === "notes" && !onDevice;
						const links = onDevice ? (
							primary === "notes" ? (
								<Button variant="ghost" size="icon-sm" asChild>
									<Link href={editorHref} aria-label={`Open ${project.title} in the editor`} title="Open in editor">
										<ArrowUpRight />
									</Link>
								</Button>
							) : null
						) : (
							<>
										{primary === "notes" ? (
											<Button variant="ghost" size="icon-sm" asChild>
												<Link href={editorHref} aria-label={`Open ${project.title} in the editor`} title="Open in editor">
													<ArrowUpRight />
												</Link>
											</Button>
										) : (
											<Button variant="ghost" size="icon-sm" asChild>
												<Link
													href={repoFileHref(workspace, project.notesFile)}
													target="_blank"
													rel="noopener noreferrer"
													aria-label={`${project.title} notes on GitHub`}
													title="Notes on GitHub"
												>
													<FileText />
												</Link>
											</Button>
										)}
										<Button variant="ghost" size="icon-sm" asChild>
											<Link
												href={repoFolderHref(workspace, `projects/${project.id}`)}
												target="_blank"
												rel="noopener noreferrer"
												aria-label={`${project.title} files on GitHub`}
												title="Files on GitHub"
											>
												<FolderOpen />
											</Link>
										</Button>
										{canShare ? (
											<>
												<Button variant="ghost" size="icon-sm" asChild>
													<Link href={shareHref(workspace, project.id)} target="_blank" aria-label={`Share page for ${project.title}`} title="Share page">
														<Globe />
													</Link>
												</Button>
												<Button variant="ghost" size="icon-sm" asChild>
													<Link href={embedHref(workspace, project.id)} target="_blank" aria-label={`Embed view of ${project.title}`} title="Embed view">
														<Code2 />
													</Link>
												</Button>
											</>
										) : null}
									</>
						);
						return (
							<tr key={project.id} className="group border-b border-rule last:border-b-0 hover:bg-muted/60">
								<td className="max-w-[22rem] px-3 py-2.5 align-top">
									<Link
										href={titleOpensGithub ? repoFileHref(workspace, project.notesFile) : editorHref}
										target={titleOpensGithub ? "_blank" : undefined}
										rel={titleOpensGithub ? "noopener noreferrer" : undefined}
										className="font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline"
									>
										{project.title}
									</Link>
									{project.description ? (
										<p className="mt-0.5 line-clamp-1 text-[0.8125rem] text-muted-foreground">{project.description}</p>
									) : null}
									{/* On narrow screens the folder, date and links move under the title. */}
									<p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground lg:hidden">
										<span className="datum text-xs break-all">projects/{project.id}</span>
										<span className="sm:hidden">{formatRevised(project.updatedAt)}</span>
									</p>
									<div className="-ml-2 mt-1 flex items-center gap-0.5 md:hidden">{links}</div>
								</td>
								<td className="datum hidden px-3 py-2.5 align-top text-muted-foreground lg:table-cell">
									projects/{project.id}
								</td>
								<td className="hidden px-3 py-2.5 align-top whitespace-nowrap text-muted-foreground sm:table-cell">
									{formatRevised(project.updatedAt)}
								</td>
								<td className="px-3 py-2.5 align-top">
									<div className="flex flex-col gap-1">
										<StateMark state={project.isLocalOnly ? "local" : "synced"} />
										<span className="text-xs text-muted-foreground">
											{project.visibility === "public" ? "Public" : "Private"}
										</span>
									</div>
								</td>
								<td className="hidden px-2 py-2 align-top md:table-cell">
									<div className="flex items-center justify-end gap-0.5">{links}</div>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

export function ProjectListSkeleton({ rows = 4 }: { rows?: number }) {
	return (
		<div className="overflow-hidden rounded-lg border border-rule bg-card" aria-busy="true" aria-label="Loading projects">
			<div className="h-8 border-b border-rule bg-muted" />
			{Array.from({ length: rows }, (_, index) => (
				<div key={index} className="flex items-center gap-4 border-b border-rule px-3 py-3 last:border-b-0">
					<div className="h-3.5 w-40 animate-pulse rounded-sm bg-accent" />
					<div className="hidden h-3.5 w-44 animate-pulse rounded-sm bg-muted lg:block" />
					<div className="ml-auto h-3.5 w-20 animate-pulse rounded-sm bg-muted" />
				</div>
			))}
		</div>
	);
}

/** An empty state that says what belongs here and how to put it there. */
export function EmptyPanel({
	title,
	children,
	action,
}: {
	title: string;
	children: React.ReactNode;
	action?: React.ReactNode;
}) {
	return (
		<div className="rounded-lg border border-dashed border-input bg-card px-5 py-8">
			<h2 className="text-base font-bold">{title}</h2>
			<div className="mt-1.5 max-w-[60ch] text-sm text-muted-foreground">{children}</div>
			{action ? <div className="mt-4 flex flex-wrap gap-2">{action}</div> : null}
		</div>
	);
}

export function Notice({ tone = "error", children }: { tone?: "error" | "info"; children: React.ReactNode }) {
	return (
		<div
			role={tone === "error" ? "alert" : "status"}
			className={
				tone === "error"
					? "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
					: "rounded-md border border-rule bg-muted px-3 py-2 text-sm text-muted-foreground"
			}
		>
			{children}
		</div>
	);
}
