"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FolderOpen, GitCommit, HardDrive, Loader2, Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { GithubProblemNotice } from "@/components/github-problem-notice";
import { LocalSyncPanel } from "@/components/local-sync-panel";
import { EmptyPanel, Notice, ProjectList, ProjectListSkeleton } from "@/components/project-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { syncWorkspaceProjectsMetadata, type Workspace } from "@/lib/api";
import {
	githubProblemFromError,
	githubProblemFromStatus,
	nonGithubErrorMessage,
	pickGithubProblem,
	type GithubProblem,
} from "@/lib/github-errors";
import { LOCAL_WORKSPACE_ID, createLocalProject, isLocalWorkspace, workspaceLabel } from "@/lib/local-workspace";
import type { WorkspaceProject } from "@/lib/project-metadata";
import { slugify } from "@/lib/sketchflow";
import { migrateTryDraftToGuestProject } from "@/lib/try-draft";
import { getSyncGithubProblem, onSyncQueueChange, queueCreateProject, retryFailedSyncActions } from "@/lib/sync-manager";
import { repoFolderHref, sketchHref } from "@/lib/workspace-routes";
import { useGithubStatus } from "@/lib/swr-hooks";
import { useAppWorkspaces, useOfflineWorkspaceProjects } from "@/lib/swr-offline";
import { useAppIdentity } from "@/lib/use-app-identity";

function shortSha(value: string | null) {
	return value ? value.slice(0, 7) : "pending";
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

const templateDrafts: Record<string, { title: string; description: string }> = {
	"system-map": {
		title: "System Map",
		description: "Architecture canvas, notes, dependencies, and decisions.",
	},
	"product-flow": {
		title: "Product Flow",
		description: "User journey, edge cases, releases, and product notes.",
	},
	"lesson-board": {
		title: "Lesson Board",
		description: "Teaching canvas, references, examples, and classroom notes.",
	},
	"repo-map": {
		title: "Repo Map",
		description: "Codebase structure, modules, ownership, and follow-up docs.",
	},
};

type NewProjectInput = { title: string; description: string };

/**
 * Writes the project to IndexedDB so the editor opens straight away. For a repository
 * workspace the first commit is then queued in the background; the guest workspace stops here.
 */
async function createProject(
	workspace: Workspace,
	input: NewProjectInput,
	takenIds: string[],
	userId: string | null,
) {
	const onDevice = isLocalWorkspace(workspace.id);
	const visibility = onDevice ? "private" : workspace.visibility;
	const created = await createLocalProject({
		workspaceId: workspace.id,
		userId,
		title: input.title,
		description: input.description,
		visibility,
		takenIds,
	});

	if (!onDevice) {
		void queueCreateProject(
			workspace.id,
			{
				title: created.project.title,
				description: created.project.description,
				projectId: created.projectId,
				sketchId: created.sketchId,
				visibility,
			},
			userId ?? undefined,
		).catch((error: unknown) => {
			console.warn("[sync] Project commit could not be queued:", error);
		});
	}

	return created;
}

function NewProjectForm({
	onDevice,
	title,
	description,
	creating,
	onTitleChange,
	onDescriptionChange,
	onSubmit,
}: {
	onDevice: boolean;
	title: string;
	description: string;
	creating: boolean;
	onTitleChange: (value: string) => void;
	onDescriptionChange: (value: string) => void;
	onSubmit: () => void;
}) {
	const slug = slugify(title || "untitled-project");

	return (
		<form
			className="rounded-lg border border-rule bg-card p-3 sm:p-4"
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit();
			}}
		>
			<h2 className="text-sm font-bold">New project</h2>
			<div className="mt-2.5 grid gap-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
				<div>
					<label htmlFor="new-project-title" className="legend-label mb-1 block">Title</label>
					<Input
						id="new-project-title"
						value={title}
						onChange={(event) => onTitleChange(event.target.value)}
						placeholder="Payments architecture"
						autoComplete="off"
					/>
				</div>
				<div>
					<label htmlFor="new-project-description" className="legend-label mb-1 block">
						Description <span className="font-normal normal-case tracking-normal">(optional)</span>
					</label>
					<Input
						id="new-project-description"
						value={description}
						onChange={(event) => onDescriptionChange(event.target.value)}
						placeholder="What this sketch explains"
						autoComplete="off"
					/>
				</div>
				<Button type="submit" disabled={creating} className="self-end">
					{creating ? <Loader2 className="animate-spin" /> : <Plus />}
					Create project
				</Button>
			</div>
			<p className="mt-2.5 text-xs text-muted-foreground">
				{onDevice ? (
					"Opens straight away and is saved in this browser."
				) : (
					<>
						Opens straight away in this browser, then commits to{" "}
						<span className="datum text-foreground">projects/{slug}</span> in your repository.
					</>
				)}
			</p>
		</form>
	);
}

function RepositoryActions({
	workspace,
	rebuilding,
	onRebuild,
}: {
	workspace: Workspace;
	rebuilding: boolean;
	onRebuild: () => void;
}) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<Button variant="outline" size="sm" asChild>
				<Link href={repoFolderHref(workspace, "projects")} target="_blank" rel="noopener noreferrer">
					<FolderOpen />
					Open on GitHub
				</Link>
			</Button>
			<Button
				variant="outline"
				size="sm"
				disabled={rebuilding}
				onClick={onRebuild}
				title="Rewrite projects/projects-metadata.json from the project folders in the repository"
			>
				{rebuilding ? <Loader2 className="animate-spin" /> : <GitCommit />}
				Rebuild index
			</Button>
		</div>
	);
}

function ProjectsSection({
	workspace,
	projects,
	filteredProjects,
	search,
	loading,
	metadataPresent,
	error,
	rebuilding,
	onRebuild,
	onClearSearch,
}: {
	workspace: Workspace;
	projects: WorkspaceProject[];
	filteredProjects: WorkspaceProject[];
	search: string;
	loading: boolean;
	metadataPresent: boolean;
	error: string | null;
	rebuilding: boolean;
	onRebuild: () => void;
	onClearSearch: () => void;
}) {
	const onDevice = isLocalWorkspace(workspace.id);
	const query = search.trim();

	return (
		<section aria-labelledby="projects-heading" className="space-y-3">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 id="projects-heading" className="text-sm font-bold">
						{filteredProjects.length} {filteredProjects.length === 1 ? "project" : "projects"}
						{query ? ` matching "${query}"` : ""}
					</h2>
					<p className="mt-0.5 text-xs text-muted-foreground">
						{onDevice ? (
							"Saved in this browser"
						) : (
							<>
								{workspace.visibility === "public" ? "Public" : "Private"} repository on{" "}
								<span className="datum">{workspace.defaultBranch}</span>
								{metadataPresent ? "" : " · project index not written yet"}
							</>
						)}
					</p>
				</div>
				{onDevice ? null : <RepositoryActions workspace={workspace} rebuilding={rebuilding} onRebuild={onRebuild} />}
			</div>

			{error ? <Notice>{error}</Notice> : null}

			{loading && projects.length === 0 ? (
				<ProjectListSkeleton />
			) : filteredProjects.length > 0 ? (
				<ProjectList projects={filteredProjects} workspace={workspace} />
			) : query ? (
				<EmptyPanel
					title="No projects match that search"
					action={
						<Button variant="outline" size="sm" onClick={onClearSearch}>
							Clear search
						</Button>
					}
				>
					Search looks at project titles, descriptions, folder names and sketch names.
				</EmptyPanel>
			) : (
				<EmptyPanel title="No projects yet">
					{onDevice
						? "A project is one sketch and its notes. Give the first one a title above and it opens in the editor."
						: "A project is a folder in your repository holding one sketch and its notes. Give the first one a title above and it opens in the editor."}
				</EmptyPanel>
			)}
		</section>
	);
}

function NoWorkspacePanel({ onUseDevice }: { onUseDevice: () => void }) {
	return (
		<EmptyPanel
			title="Connect a repository to start"
			action={
				<>
					<Button asChild>
						<Link href="/app/workspace?new=1">
							<Plus />
							Set up a workspace
						</Link>
					</Button>
					<Button variant="outline" onClick={onUseDevice}>
						<HardDrive />
						Work on this device
					</Button>
				</>
			}
		>
			A workspace is one GitHub repository that you own. Sketchflow saves every sketch and note there as plain
			files, so your work stays yours.
		</EmptyPanel>
	);
}

/** Applies a `?template=` link to the new-project form once per template. */
function useTemplateDraft(template: string | null, apply: (draft: NewProjectInput) => void) {
	const appliedTemplateRef = useRef<string | null>(null);

	useEffect(() => {
		if (!template || appliedTemplateRef.current === template) return;
		const draft = templateDrafts[template];
		if (!draft) return;
		appliedTemplateRef.current = template;
		apply(draft);
	}, [template, apply]);
}

/** The GitHub problem holding up this user's queued saves, kept current as the queue changes. */
function useSyncQueueProblem(userId: string | null) {
	const [problem, setProblem] = useState<GithubProblem | null>(null);

	useEffect(() => {
		if (!userId) return;

		let active = true;
		const read = () => {
			void getSyncGithubProblem(userId).then((next) => {
				if (active) setProblem(next);
			});
		};
		read();
		const unsubscribe = onSyncQueueChange(read);

		return () => {
			active = false;
			unsubscribe();
		};
	}, [userId]);

	return userId ? problem : null;
}

export function ProjectsHomeClient() {
	const router = useRouter();
	const searchParams = useSearchParams();
	// A link can name the workspace to open (the workspace list and the editor breadcrumb do).
	const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(() => searchParams.get("workspace"));
	const [syncingIndex, setSyncingIndex] = useState(false);
	const [newProjectTitle, setNewProjectTitle] = useState("");
	const [newProjectDescription, setNewProjectDescription] = useState("");
	const [creatingProject, setCreatingProject] = useState(false);
	const [projectSearch, setProjectSearch] = useState("");
	const [localError, setLocalError] = useState<string | null>(null);
	// A GitHub problem raised by something the user just did here, such as rebuilding the index.
	const [actionProblem, setActionProblem] = useState<GithubProblem | null>(null);

	const { isSignedIn, isLoading: identityLoading, userId } = useAppIdentity();
	const {
		workspaces,
		selectedWorkspace,
		isLoading: workspacesLoading,
		error: workspacesError,
		refresh: refreshWorkspaces,
	} = useAppWorkspaces(userId, selectedWorkspaceId);
	const repoWorkspace = selectedWorkspace && !isLocalWorkspace(selectedWorkspace.id) ? selectedWorkspace : null;

	// GitHub status only matters for a repository workspace; guests never call it.
	const {
		data: githubStatus,
		error: githubError,
		mutate: mutateGithubStatus,
	} = useGithubStatus(repoWorkspace ? userId : null);

	const {
		projects,
		metadataPresent,
		isLoading: projectsLoading,
		mutate: mutateProjects,
		error: projectsError,
	} = useOfflineWorkspaceProjects(selectedWorkspace?.id, userId);

	const filteredProjects = useMemo(() => {
		const query = projectSearch.trim().toLowerCase();
		return query ? projects.filter((project) => matchesSearch(project, query)) : projects;
	}, [projectSearch, projects]);

	const queueProblem = useSyncQueueProblem(repoWorkspace ? userId : null);
	// GitHub problems are told apart by code, so only a rejected sign-in asks to reconnect.
	// The page itself keeps working from this browser whichever of them is showing.
	const pageProblem = repoWorkspace
		? pickGithubProblem([
				githubProblemFromStatus(githubStatus),
				githubProblemFromError(projectsError),
				githubProblemFromError(githubError),
				actionProblem,
			])
		: null;
	const githubProblem = pickGithubProblem([pageProblem, queueProblem]);
	const pageError =
		localError || nonGithubErrorMessage(workspacesError) || (repoWorkspace ? nonGithubErrorMessage(githubError) : null);

	useTemplateDraft(searchParams.get("template"), (draft) => {
		setNewProjectTitle(draft.title);
		setNewProjectDescription(draft.description);
	});

	// A sketch left over from the old /try page becomes a project on this device, once.
	useEffect(() => {
		let active = true;
		migrateTryDraftToGuestProject()
			.then((created) => {
				if (created && active) void refreshWorkspaces();
			})
			.catch(() => {
				if (active) setLocalError("An earlier scratch sketch could not be turned into a project. It is still in this browser.");
			});
		return () => {
			active = false;
		};
	}, [refreshWorkspaces]);

	async function refresh() {
		setLocalError(null);
		setActionProblem(null);
		await Promise.all([
			refreshWorkspaces(),
			repoWorkspace ? mutateGithubStatus() : undefined,
			mutateProjects(),
			queueProblem ? retryFailedSyncActions(userId ?? undefined) : undefined,
		]);
	}

	async function handleSyncProjectIndex() {
		if (!repoWorkspace) return;

		setSyncingIndex(true);
		setLocalError(null);
		setActionProblem(null);

		try {
			const response = await syncWorkspaceProjectsMetadata(repoWorkspace.id);
			await mutateProjects(response, { revalidate: false });
			await refreshWorkspaces();
		} catch (syncError) {
			const problem = githubProblemFromError(syncError);
			setActionProblem(problem);
			if (!problem) {
				setLocalError(syncError instanceof Error ? syncError.message : "Project index could not be updated");
			}
		} finally {
			setSyncingIndex(false);
		}
	}

	async function handleCreateProject() {
		if (!selectedWorkspace) return;

		setCreatingProject(true);
		setLocalError(null);

		try {
			const created = await createProject(
				selectedWorkspace,
				{ title: newProjectTitle, description: newProjectDescription },
				projects.map((project) => project.id),
				userId,
			);
			setNewProjectTitle("");
			setNewProjectDescription("");
			void mutateProjects();
			router.push(sketchHref(selectedWorkspace.id, created.projectId, created.sketchId));
		} catch (error) {
			setLocalError(error instanceof Error ? error.message : "The project could not be created. Try again.");
		} finally {
			setCreatingProject(false);
		}
	}

	const isInitialLoading = identityLoading || (workspacesLoading && workspaces.length === 0);

	return (
		<AppShell
			title="Projects"
			subtitle={selectedWorkspace ? workspaceLabel(selectedWorkspace) : undefined}
			syncLabel={repoWorkspace ? `${repoWorkspace.defaultBranch} @ ${shortSha(repoWorkspace.latestCommitSha)}` : undefined}
			workspaces={workspaces}
			selectedWorkspaceId={selectedWorkspace?.id ?? null}
			onWorkspaceChange={setSelectedWorkspaceId}
			githubUnreachable={Boolean(pageProblem)}
			searchValue={projectSearch}
			onSearchChange={setProjectSearch}
			searchPlaceholder="Search projects"
			action={
				<Button variant="ghost" size="icon-sm" onClick={() => void refresh()} aria-label="Refresh projects" title="Refresh">
					<RefreshCw />
				</Button>
			}
		>
			<div className="mx-auto flex max-w-6xl flex-col gap-5">
				{githubProblem ? <GithubProblemNotice {...githubProblem} onRetry={refresh} /> : null}
				{pageError ? <Notice>{pageError}</Notice> : null}

				{isInitialLoading ? (
					<ProjectListSkeleton />
				) : selectedWorkspace ? (
					<>
						{isSignedIn && repoWorkspace ? (
							<LocalSyncPanel
								workspace={repoWorkspace}
								onSynced={async () => {
									await Promise.all([mutateProjects(), refreshWorkspaces()]);
								}}
							/>
						) : null}

						<NewProjectForm
							onDevice={!repoWorkspace}
							title={newProjectTitle}
							description={newProjectDescription}
							creating={creatingProject}
							onTitleChange={setNewProjectTitle}
							onDescriptionChange={setNewProjectDescription}
							onSubmit={() => void handleCreateProject()}
						/>

						<ProjectsSection
							workspace={selectedWorkspace}
							projects={projects}
							filteredProjects={filteredProjects}
							search={projectSearch}
							loading={projectsLoading}
							metadataPresent={metadataPresent}
							error={repoWorkspace ? nonGithubErrorMessage(projectsError) : null}
							rebuilding={syncingIndex}
							onRebuild={() => void handleSyncProjectIndex()}
							onClearSearch={() => setProjectSearch("")}
						/>
					</>
				) : (
					<NoWorkspacePanel onUseDevice={() => setSelectedWorkspaceId(LOCAL_WORKSPACE_ID)} />
				)}
			</div>
		</AppShell>
	);
}
