"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Boxes, FileText, LayoutTemplate, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { EmptyPanel, ProjectList, ProjectListSkeleton } from "@/components/project-list";
import { Button } from "@/components/ui/button";
import { redirectToSignIn } from "@/lib/auth-client";
import type { WorkspaceProject } from "@/lib/project-metadata";
import { useAuthMe } from "@/lib/swr-hooks";
import { useOfflineWorkspaces, useOfflineWorkspaceProjects } from "@/lib/swr-offline";

type AppSection = "recent" | "docs" | "public" | "templates";

const sectionConfig = {
	recent: {
		title: "Recent",
		emptyTitle: "Nothing revised yet",
		empty: "Projects appear here in the order you last saved them, newest first.",
	},
	docs: {
		title: "Notes",
		emptyTitle: "No notes yet",
		empty: "Every project keeps its notes as a Markdown file next to the sketch. Open a project, write beside the canvas, and save.",
	},
	public: {
		title: "Shared",
		emptyTitle: "Nothing is shared",
		empty: "Projects in a public repository get a read-only share page and an embed view. Private repositories are never shared.",
	},
	templates: {
		title: "Templates",
		emptyTitle: "No templates match that search",
		empty: "Search looks at template names and descriptions.",
	},
} satisfies Record<AppSection, { title: string; emptyTitle: string; empty: string }>;

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

function sortRecent(projects: WorkspaceProject[]) {
	return [...projects].sort((left, right) => {
		return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
	});
}

export function AppSectionClient({ section }: { section: AppSection }) {
	const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const {
		data: auth,
		isLoading: authLoading,
	} = useAuthMe();
	const {
		workspaces,
		isLoading: workspacesLoading,
		mutate: mutateWorkspaces,
	} = useOfflineWorkspaces(auth?.user?.id);
	const selectedWorkspace = useMemo(
		() => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? workspaces[0] ?? null,
		[selectedWorkspaceId, workspaces],
	);
	const {
		projects,
		isLoading: projectsLoading,
		mutate: mutateProjects,
	} = useOfflineWorkspaceProjects(selectedWorkspace?.id, auth?.user?.id);

	const query = search.trim().toLowerCase();
	const visibleTemplates = useMemo(() => {
		if (!query) return templates;
		return templates.filter((item) => `${item.title} ${item.description}`.toLowerCase().includes(query));
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
		if (auth && !auth.authenticated) {
			redirectToSignIn();
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
			subtitle={selectedWorkspace ? `${selectedWorkspace.repoOwner}/${selectedWorkspace.repoName}` : undefined}
			workspaces={workspaces}
			selectedWorkspaceId={selectedWorkspace?.id ?? null}
			onWorkspaceChange={setSelectedWorkspaceId}
			searchValue={search}
			onSearchChange={setSearch}
			searchPlaceholder={`Search ${config.title.toLowerCase()}`}
			action={
				<Button variant="ghost" size="icon-sm" onClick={() => void refresh()} aria-label={`Refresh ${config.title}`} title="Refresh">
					{loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
				</Button>
			}
		>
			<div className="mx-auto max-w-6xl space-y-4">
				{section === "templates" ? (
					<>
						<p className="max-w-[65ch] text-sm text-muted-foreground">
							A template starts a new project with a title and description filled in. The canvas starts empty, and
							you can rename everything before creating it.
						</p>
						{visibleTemplates.length > 0 ? (
							<ul className="overflow-hidden rounded-lg border border-rule bg-card">
								{visibleTemplates.map((template) => (
									<li
										key={template.id}
										className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-3 py-3 last:border-b-0"
									>
										<template.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
										<div className="min-w-0 flex-1 basis-64">
											<h2 className="text-sm font-semibold">{template.title}</h2>
											<p className="text-[0.8125rem] text-muted-foreground">{template.description}</p>
										</div>
										<Button variant="outline" size="sm" asChild>
											<Link href={`/app?template=${template.id}`}>
												Use template
												<ArrowRight />
											</Link>
										</Button>
									</li>
								))}
							</ul>
						) : (
							<EmptyPanel
								title={config.emptyTitle}
								action={
									<Button variant="outline" size="sm" onClick={() => setSearch("")}>
										Clear search
									</Button>
								}
							>
								{config.empty}
							</EmptyPanel>
						)}
					</>
				) : loading && visibleProjects.length === 0 ? (
					<ProjectListSkeleton />
				) : !selectedWorkspace ? (
					<EmptyPanel
						title="Connect a repository to start"
						action={
							<Button asChild>
								<Link href="/app/workspace?new=1">
									Set up a workspace
									<ArrowRight />
								</Link>
							</Button>
						}
					>
						A workspace is one GitHub repository that you own. Your projects, sketches and notes are saved there.
					</EmptyPanel>
				) : visibleProjects.length > 0 ? (
					<ProjectList
						projects={visibleProjects}
						workspace={selectedWorkspace}
						primary={section === "docs" ? "notes" : "sketch"}
					/>
				) : query ? (
					<EmptyPanel
						title={`Nothing matches "${search.trim()}"`}
						action={
							<Button variant="outline" size="sm" onClick={() => setSearch("")}>
								Clear search
							</Button>
						}
					>
						Search looks at project titles, descriptions, folder names and sketch names.
					</EmptyPanel>
				) : (
					<EmptyPanel
						title={config.emptyTitle}
						action={
							<Button variant="outline" size="sm" asChild>
								<Link href="/app">
									Go to projects
									<ArrowRight />
								</Link>
							</Button>
						}
					>
						{config.empty}
					</EmptyPanel>
				)}
			</div>
		</AppShell>
	);
}
