"use client";

import Link from "next/link";
import { useStackApp } from "@stackframe/stack";
import {
	ArrowRight,
	BookOpen,
	Boxes,
	Code2,
	FileText,
	FolderOpen,
	Globe,
	LayoutTemplate,
	Loader2,
	RefreshCw,
	Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import type { Workspace } from "@/lib/api";
import type { WorkspaceProject } from "@/lib/project-metadata";
import {
	DEFAULT_SKETCH_ID,
	embedHref,
	repoFileHref,
	repoFolderHref,
	shareHref,
	sketchHref,
} from "@/lib/workspace-routes";
import {
	useAuthMe,
	useWorkspaceProjects,
	useWorkspaces,
} from "@/lib/swr-hooks";

type AppSection = "recent" | "docs" | "public" | "templates";

const sectionConfig = {
	recent: {
		title: "Recent",
		subtitle: "Recently touched projects and canvases",
		empty: "No recent projects yet. Create a project and your latest work will appear here.",
	},
	docs: {
		title: "Docs",
		subtitle: "Markdown notes saved inside each project folder",
		empty: "No docs yet. Open a canvas, write project notes, and save to GitHub.",
	},
	public: {
		title: "Public",
		subtitle: "Public project pages and embed links",
		empty: "No public projects yet. Public workspaces and public projects will appear here.",
	},
	templates: {
		title: "Templates",
		subtitle: "Starter workflows for common visual docs",
		empty: "Templates are ready to use as starter prompts and project patterns.",
	},
} satisfies Record<AppSection, { title: string; subtitle: string; empty: string }>;

const templates = [
	{
		id: "system-map",
		title: "System Map",
		description: "A technical architecture map with canvas, notes, components, and follow-up decisions.",
		icon: Boxes,
	},
	{
		id: "product-flow",
		title: "Product Flow",
		description: "A product journey canvas for flows, edge cases, docs, and user-facing milestones.",
		icon: LayoutTemplate,
	},
	{
		id: "lesson-board",
		title: "Lesson Board",
		description: "A teaching board with diagrams, references, examples, and classroom notes.",
		icon: BookOpen,
	},
	{
		id: "repo-map",
		title: "Repo Map",
		description: "A codebase map for modules, ownership, dependencies, and refactor notes.",
		icon: FileText,
	},
];

function firstSketchId(project: WorkspaceProject) {
	return project.defaultSketchId || project.sketches[0]?.id || DEFAULT_SKETCH_ID;
}

function formatDate(value: string) {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "Recently" : date.toLocaleDateString();
}

function sortRecent(projects: WorkspaceProject[]) {
	return [...projects].sort((left, right) => {
		return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
	});
}

export function AppSectionClient({ section }: { section: AppSection }) {
	const app = useStackApp();
	const appRef = useRef(app);
	const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const {
		data: auth,
		isLoading: authLoading,
	} = useAuthMe();
	const {
		data: workspaceData,
		isLoading: workspacesLoading,
		mutate: mutateWorkspaces,
	} = useWorkspaces(auth?.user?.id);
	const workspaces = useMemo(() => workspaceData?.workspaces ?? [], [workspaceData]);
	const selectedWorkspace = useMemo(
		() => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? workspaces[0] ?? null,
		[selectedWorkspaceId, workspaces],
	);
	const {
		data: projectsData,
		isLoading: projectsLoading,
		mutate: mutateProjects,
	} = useWorkspaceProjects(selectedWorkspace?.id);
	const projects = projectsData?.projects ?? [];
	const query = search.trim().toLowerCase();
	const visibleProjects = useMemo(() => {
		const base = section === "public"
			? projects.filter((project) => project.visibility === "public" && selectedWorkspace?.visibility === "public")
			: sortRecent(projects);

		if (!query) return base;

		return base.filter((project) =>
			[
				project.id,
				project.title,
				project.description ?? "",
				project.notesFile,
				project.projectFile,
				...project.sketches.flatMap((sketch) => [sketch.id, sketch.title, sketch.file]),
			]
				.join(" ")
				.toLowerCase()
				.includes(query),
		);
	}, [projects, query, section, selectedWorkspace?.visibility]);
	const loading = authLoading || workspacesLoading || projectsLoading;
	const config = sectionConfig[section];

	useEffect(() => {
		appRef.current = app;
	}, [app]);

	useEffect(() => {
		if (auth && !auth.authenticated) {
			void appRef.current.redirectToSignIn();
		}
	}, [auth]);

	useEffect(() => {
		setSelectedWorkspaceId((current) =>
			current && workspaces.some((workspace) => workspace.id === current)
				? current
				: workspaces[0]?.id ?? null,
		);
	}, [workspaces]);

	async function refresh() {
		await Promise.all([mutateWorkspaces(), mutateProjects()]);
	}

	return (
		<AppShell
			title={config.title}
			subtitle={selectedWorkspace ? `${selectedWorkspace.repoOwner}/${selectedWorkspace.repoName}` : config.subtitle}
			workspaces={workspaces}
			selectedWorkspaceId={selectedWorkspace?.id ?? null}
			onWorkspaceChange={setSelectedWorkspaceId}
			searchValue={search}
			onSearchChange={setSearch}
			searchPlaceholder={`Search ${config.title.toLowerCase()}`}
			action={
				<Button variant="ghost" size="icon" onClick={() => void refresh()} aria-label={`Refresh ${config.title}`}>
					{loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
				</Button>
			}
		>
			<div className="mx-auto max-w-6xl space-y-5">
				{!selectedWorkspace && !loading ? (
					<Card>
						<CardHeader>
							<CardTitle>Create a workspace first</CardTitle>
							<CardDescription>Connect GitHub to start adding projects.</CardDescription>
						</CardHeader>
						<CardContent>
							<Button asChild>
								<Link href="/app/workspace?new=1">
									Create workspace
									<ArrowRight className="size-4" />
								</Link>
							</Button>
						</CardContent>
					</Card>
				) : null}

				{section === "templates" ? (
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
						{templates.map((template) => {
							const Icon = template.icon;
							return (
								<Card key={template.title}>
									<CardHeader>
										<div className="grid size-10 place-items-center rounded-xl bg-muted text-primary">
											<Icon className="size-5" />
										</div>
										<CardTitle>{template.title}</CardTitle>
										<CardDescription>{template.description}</CardDescription>
									</CardHeader>
									<CardContent>
										<Button variant="outline" size="sm" className="w-full justify-between" asChild>
											<Link href={`/app?template=${template.id}`}>
												Use template
												<ArrowRight className="size-4" />
											</Link>
										</Button>
									</CardContent>
								</Card>
							);
						})}
					</div>
				) : null}

				{section !== "templates" ? (
					<div className="grid gap-4">
						{loading ? (
							[0, 1, 2].map((item) => (
								<div key={item} className="h-28 animate-pulse rounded-2xl bg-muted" />
							))
						) : visibleProjects.length > 0 && selectedWorkspace ? (
							visibleProjects.map((project) => (
								<ProjectSectionCard
									key={project.id}
									project={project}
									section={section}
									workspace={selectedWorkspace}
								/>
							))
						) : (
							<Card>
								<CardHeader>
									<div className="flex items-center gap-2">
										<Sparkles className="size-4 text-primary" />
										<CardTitle>{config.empty}</CardTitle>
									</div>
									<CardDescription>{config.subtitle}</CardDescription>
								</CardHeader>
								<CardContent>
									<Button variant="outline" size="sm" asChild>
										<Link href="/app">
											Go to projects
											<ArrowRight className="size-4" />
										</Link>
									</Button>
								</CardContent>
							</Card>
						)}
					</div>
				) : null}
			</div>
		</AppShell>
	);
}

function ProjectSectionCard({
	project,
	section,
	workspace,
}: {
	project: WorkspaceProject;
	section: AppSection;
	workspace: Pick<Workspace, "id" | "repoOwner" | "repoName" | "defaultBranch" | "visibility">;
}) {
	const canShare = workspace.visibility === "public" && project.visibility === "public";

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<CardTitle>{project.title}</CardTitle>
						<CardDescription>
							projects/{project.id} · updated {formatDate(project.updatedAt)}
						</CardDescription>
					</div>
					<Badge variant={project.visibility === "public" ? "default" : "outline"}>
						{project.visibility}
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="flex flex-wrap gap-2">
				<Button size="sm" asChild>
					<Link href={sketchHref(workspace.id, project.id, firstSketchId(project))}>
						Open canvas
						<ArrowRight className="size-4" />
					</Link>
				</Button>
				<Button variant="outline" size="sm" asChild>
					<Link href={repoFolderHref(workspace, `projects/${project.id}`)} target="_blank">
						<FolderOpen className="size-4" />
						Files
					</Link>
				</Button>
				<Button variant="outline" size="sm" asChild>
					<Link href={repoFileHref(workspace, project.notesFile)} target="_blank">
						<FileText className="size-4" />
						Notes
					</Link>
				</Button>
				{canShare && (section === "public" || project.visibility === "public") ? (
					<>
						<Button variant="outline" size="sm" asChild>
							<Link href={shareHref(workspace, project.id)} target="_blank">
								<Globe className="size-4" />
								Share
							</Link>
						</Button>
						<Button variant="outline" size="sm" asChild>
							<Link href={embedHref(workspace, project.id)} target="_blank">
								<Code2 className="size-4" />
								Embed
							</Link>
						</Button>
					</>
				) : null}
			</CardContent>
		</Card>
	);
}
