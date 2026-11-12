"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, BookOpen, Boxes, FileText, LayoutTemplate, Loader2, LogIn, RefreshCw } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { EmptyPanel, ProjectList, ProjectListSkeleton } from "@/components/project-list";
import { Button } from "@/components/ui/button";
import type { Workspace } from "@/lib/api";
import { isLocalWorkspace, workspaceLabel } from "@/lib/local-workspace";
import type { WorkspaceProject } from "@/lib/project-metadata";
import { signInPath } from "@/lib/return-path";
import { useAppWorkspaces, useOfflineWorkspaceProjects } from "@/lib/swr-offline";
import { useAppIdentity } from "@/lib/use-app-identity";

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

function matchesSearch(project: WorkspaceProject, query: string) {
	return [
		project.id,
		project.title,
		project.description ?? "",
		project.notesFile,
		project.projectFile,
		...project.sketches.flatMap((sketch) => [sketch.id, sketch.title, sketch.file]),
	]
		.join(" ")
		.toLowerCase()
		.includes(query);
}

function ClearSearchButton({ onClick }: { onClick: () => void }) {
	return (
		<Button variant="outline" size="sm" onClick={onClick}>
			Clear search
		</Button>
	);
}

function TemplatesSection({ query, onClearSearch }: { query: string; onClearSearch: () => void }) {
	const visibleTemplates = query
		? templates.filter((item) => `${item.title} ${item.description}`.toLowerCase().includes(query))
		: templates;

	return (
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
				<EmptyPanel title={sectionConfig.templates.emptyTitle} action={<ClearSearchButton onClick={onClearSearch} />}>
					{sectionConfig.templates.empty}
				</EmptyPanel>
			)}
		</>
	);
}

/** Shown on "Shared" when there is no repository to publish from. */
function SharingNeedsGithub({
	isSignedIn,
	firstRepoWorkspace,
	onChooseWorkspace,
}: {
	isSignedIn: boolean;
	firstRepoWorkspace: Workspace | null;
	onChooseWorkspace: (workspaceId: string) => void;
}) {
	let action: ReactNode;
	if (!isSignedIn) {
		action = (
			<Button asChild>
				<Link href={signInPath("/app/public")}>
					<LogIn />
					Sign in with GitHub
				</Link>
			</Button>
		);
	} else if (firstRepoWorkspace) {
		action = <Button onClick={() => onChooseWorkspace(firstRepoWorkspace.id)}>Choose a repository workspace</Button>;
	} else {
		action = (
			<Button asChild>
				<Link href="/app/workspace?new=1">Choose a repository workspace</Link>
			</Button>
		);
	}

	return (
		<EmptyPanel title="Sharing needs GitHub" action={action}>
			Shared pages are published from a public repository you own.
		</EmptyPanel>
	);
}

function ProjectsSectionBody({
	section,
	workspace,
	projects,
	loading,
	query,
	search,
	onClearSearch,
}: {
	section: Exclude<AppSection, "templates">;
	workspace: Workspace | null;
	projects: WorkspaceProject[];
	loading: boolean;
	query: string;
	search: string;
	onClearSearch: () => void;
}) {
	const config = sectionConfig[section];

	if (loading && projects.length === 0) return <ProjectListSkeleton />;

	if (!workspace) {
		return (
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
		);
	}

	if (projects.length > 0) {
		return <ProjectList projects={projects} workspace={workspace} primary={section === "docs" ? "notes" : "sketch"} />;
	}

	if (query) {
		return (
			<EmptyPanel title={`Nothing matches "${search.trim()}"`} action={<ClearSearchButton onClick={onClearSearch} />}>
				Search looks at project titles, descriptions, folder names and sketch names.
			</EmptyPanel>
		);
	}

	return (
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
	);
}

export function AppSectionClient({ section }: { section: AppSection }) {
	const searchParams = useSearchParams();
	const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(() => searchParams.get("workspace"));
	const [search, setSearch] = useState("");
	const { isSignedIn, isLoading: identityLoading, userId } = useAppIdentity();
	const {
		workspaces,
		selectedWorkspace,
		isLoading: workspacesLoading,
		refresh: refreshWorkspaces,
	} = useAppWorkspaces(userId, selectedWorkspaceId);
	const {
		projects,
		isLoading: projectsLoading,
		mutate: mutateProjects,
	} = useOfflineWorkspaceProjects(selectedWorkspace?.id, userId);

	const onDevice = isLocalWorkspace(selectedWorkspace?.id);
	const sharingUnavailable = section === "public" && (!isSignedIn || onDevice);
	const firstRepoWorkspace = workspaces.find((workspace) => !isLocalWorkspace(workspace.id)) ?? null;

	const query = search.trim().toLowerCase();
	const visibleProjects = useMemo(() => {
		const base =
			section === "public"
				? projects.filter((project) => project.visibility === "public" && selectedWorkspace?.visibility === "public")
				: sortRecent(projects);

		return query ? base.filter((project) => matchesSearch(project, query)) : base;
	}, [projects, query, section, selectedWorkspace?.visibility]);
	const loading = identityLoading || workspacesLoading || projectsLoading;
	const config = sectionConfig[section];

	async function refresh() {
		await Promise.all([refreshWorkspaces(), mutateProjects()]);
	}

	let body: ReactNode;
	if (section === "templates") {
		body = <TemplatesSection query={query} onClearSearch={() => setSearch("")} />;
	} else if (sharingUnavailable && !identityLoading) {
		body = (
			<SharingNeedsGithub
				isSignedIn={isSignedIn}
				firstRepoWorkspace={firstRepoWorkspace}
				onChooseWorkspace={setSelectedWorkspaceId}
			/>
		);
	} else {
		body = (
			<ProjectsSectionBody
				section={section}
				workspace={selectedWorkspace}
				projects={visibleProjects}
				loading={loading}
				query={query}
				search={search}
				onClearSearch={() => setSearch("")}
			/>
		);
	}

	return (
		<AppShell
			title={config.title}
			subtitle={selectedWorkspace ? workspaceLabel(selectedWorkspace) : undefined}
			workspaces={workspaces}
			selectedWorkspaceId={selectedWorkspace?.id ?? null}
			onWorkspaceChange={setSelectedWorkspaceId}
			searchValue={search}
			onSearchChange={sharingUnavailable ? undefined : setSearch}
			searchPlaceholder={`Search ${config.title.toLowerCase()}`}
			action={
				<Button variant="ghost" size="icon-sm" onClick={() => void refresh()} aria-label={`Refresh ${config.title}`} title="Refresh">
					{loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
				</Button>
			}
		>
			<div className="mx-auto max-w-6xl space-y-4">{body}</div>
		</AppShell>
	);
}
