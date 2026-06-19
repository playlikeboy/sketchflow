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
import { getLocalProjects } from "@/lib/indexeddb";
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
import templatesData from "@/lib/templates-data.json";

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
	} = useWorkspaceProjects(selectedWorkspace?.id, auth?.user?.id);

	const [localProjects, setLocalProjects] = useState<WorkspaceProject[]>([]);

	useEffect(() => {
		if (selectedWorkspace?.id) {
			getLocalProjects(selectedWorkspace.id).then(setLocalProjects);
		} else {
			setLocalProjects([]);
		}
	}, [selectedWorkspace?.id]);

	const remoteProjects = projectsData?.projects ?? [];
	const projects = useMemo(() => {
		const merged = [...remoteProjects];
		for (const lp of localProjects) {
			if (!merged.some((p) => p.id === lp.id)) {
				merged.push(lp);
			}
		}
		return merged;
	}, [remoteProjects, localProjects]);

	const query = search.trim().toLowerCase();
	const visibleTemplates = useMemo(() => {
		if (!query) return templatesData;
		return templatesData.filter((item) =>
			[item.title, item.author, ...item.tags]
				.join(" ")
				.toLowerCase()
				.includes(query)
		);
	}, [query]);
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
					<div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
						{visibleTemplates.map((template) => (
							<TemplateVideoCard key={template.id} template={template} />
						))}
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
						<div className="flex items-center gap-2">
							<CardTitle>{project.title}</CardTitle>
							{project.isLocalOnly && (
								<span className="relative flex h-2 w-2 shrink-0" title="Offline (Sync Required)">
									<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
									<span className="relative inline-flex rounded-full h-2 w-2 bg-red-600"></span>
								</span>
							)}
						</div>
						<CardDescription>
							projects/{project.id} · updated {formatDate(project.updatedAt)}
						</CardDescription>
					</div>
					<div className="flex flex-col items-end gap-1.5 shrink-0">
						<Badge variant={project.visibility === "public" ? "default" : "outline"}>
							{project.visibility}
						</Badge>
						{project.isLocalOnly && (
							<Badge variant="destructive" className="bg-red-600 text-white text-[9px] py-0.5 px-1.5 font-extrabold uppercase tracking-wide border-none rounded">
								Offline
							</Badge>
						)}
					</div>
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

type TemplateItem = (typeof templatesData)[0];

function TemplateVideoCard({ template }: { template: TemplateItem }) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const [hovered, setHovered] = useState(false);

	useEffect(() => {
		if (!videoRef.current) return;
		if (hovered) {
			videoRef.current.play().catch(() => {});
		} else {
			videoRef.current.pause();
			videoRef.current.currentTime = 0;
		}
	}, [hovered]);

	return (
		<Card
			className="group/card flex h-full flex-col overflow-hidden border-2 border-border/80 bg-card shadow-[0_2px_0_var(--border)] transition-all duration-300 hover:border-primary/45"
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			<div className="relative aspect-[4/3] w-full overflow-hidden border-b border-border/80 bg-muted/20">
				<video
					ref={videoRef}
					src={template.videoUrl}
					poster={template.posterUrl}
					muted
					loop
					playsInline
					className="h-full w-full object-cover transition-transform duration-500 group-hover/card:scale-[1.03]"
				/>
				<div className="absolute right-2 top-2 select-none rounded-full bg-[#1A1A1A]/85 px-2 py-0.5 text-xs font-extrabold text-white shadow-sm border border-white/10 select-none backdrop-blur-md">
					${template.price.toFixed(2)}
				</div>
			</div>
			<CardHeader className="flex-1 p-4">
				<div className="mb-2 flex flex-wrap gap-1">
					{template.tags.slice(0, 3).map((tag) => (
						<Badge
							key={tag}
							variant="secondary"
							className="rounded-md px-1.5 py-0 text-[9px] font-extrabold uppercase tracking-wide"
						>
							{tag}
						</Badge>
					))}
				</div>
				<CardTitle className="line-clamp-1 text-sm font-extrabold text-foreground transition-colors group-hover/card:text-primary">
					{template.title}
				</CardTitle>
				<CardDescription className="mt-1 line-clamp-2 text-xs font-semibold text-muted-foreground">
					By {template.author} · An interactive design template featuring premium layouts.
				</CardDescription>
			</CardHeader>
			<CardContent className="p-4 pt-0">
				<div className="flex gap-2">
					<Button variant="outline" size="xs" className="flex-1 justify-center rounded-xl font-bold" asChild>
						<a href={template.demoLink} target="_blank" rel="noopener noreferrer">
							Preview
						</a>
					</Button>
					<Button
						size="xs"
						className="flex-1 justify-center rounded-xl bg-[#58CC02] text-white shadow-[0_3px_0_#46A302] hover:brightness-105 active:translate-y-[3px] active:shadow-none transition-all font-bold"
						asChild
					>
						<Link href={`/app?template=${template.id}`}>
							Use
						</Link>
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
