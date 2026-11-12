"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useStackApp } from "@stackframe/stack";
import { FolderOpen, GitCommit, Loader2, Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { GithubAccessCard } from "@/components/github-access-card";
import { StateGlyph } from "@/components/state-mark";
import { EmptyPanel, Notice, ProjectList, ProjectListSkeleton } from "@/components/project-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	syncWorkspaceProjectsMetadata,
	ApiError,
	type SketchScene,
	type Workspace,
} from "@/lib/api";
import type { WorkspaceProject } from "@/lib/project-metadata";
import { slugify, draftKey, humanizeSlug } from "@/lib/sketchflow";
import { saveLocalProject, setDraft } from "@/lib/indexeddb";
import { clearTryDraft, readTryDraft, tryDraftHasContent } from "@/lib/try-draft";
import { queueCreateProject } from "@/lib/sync-manager";
import { DEFAULT_SKETCH_ID, repoFolderHref, sketchHref } from "@/lib/workspace-routes";
import {
	useAuthMe,
	useGithubStatus,
} from "@/lib/swr-hooks";
import {
	useOfflineWorkspaces,
	useOfflineWorkspaceProjects,
} from "@/lib/swr-offline";

function shortSha(value: string | null) {
	return value ? value.slice(0, 7) : "pending";
}

function friendlyError(message: string) {
	if (message.toLowerCase().includes("github")) {
		return "GitHub access needs a refresh.";
	}

	return message;
}

function errorCopy(error: unknown) {
	if (error instanceof ApiError && error.code?.startsWith("github_")) {
		return "GitHub access needs a refresh.";
	}

	return error instanceof Error ? friendlyError(error.message) : null;
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

export function ProjectsHomeClient() {
	const app = useStackApp();
	const appRef = useRef(app);
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
	const appliedTemplateRef = useRef<string | null>(null);
	const [tryDraft, setTryDraft] = useState<{ scene: SketchScene | null; notes: string | null } | null>(null);
	const [importingTry, setImportingTry] = useState(false);

	const {
		data: auth,
		error: authError,
		isLoading: authLoading,
	} = useAuthMe();

	const {
		workspaces,
		isLoading: workspacesLoading,
		mutate: mutateWorkspaces,
		error: workspacesError,
	} = useOfflineWorkspaces(auth?.user?.id);

	const {
		data: githubStatus,
		error: githubError,
		mutate: mutateGithubStatus,
	} = useGithubStatus(auth?.user?.id);

	const selectedWorkspace = useMemo(
		() => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? workspaces[0] ?? null,
		[selectedWorkspaceId, workspaces],
	);

	const {
		projects,
		metadataPresent,
		isLoading: projectsLoading,
		mutate: mutateProjects,
		error: projectsError,
	} = useOfflineWorkspaceProjects(selectedWorkspace?.id, auth?.user?.id);

	const filteredProjects = useMemo(() => {
		const query = projectSearch.trim().toLowerCase();
		if (!query) return projects;

		return projects.filter((project) => {
			const haystack = [
				project.id,
				project.title,
				project.description ?? "",
				project.notesFile,
				project.projectFile,
				...project.sketches.flatMap((sketch) => [sketch.id, sketch.title, sketch.file]),
			]
				.join(" ")
				.toLowerCase();

			return haystack.includes(query);
		});
	}, [projectSearch, projects]);

	const loading = authLoading;
	const pageError =
		localError ||
		errorCopy(authError) ||
		errorCopy(workspacesError) ||
		errorCopy(githubError);
	const projectError = errorCopy(projectsError);

	useEffect(() => {
		appRef.current = app;
	}, [app]);

	// A sketch made on /try before signing in is offered as a new project.
	useEffect(() => {
		let active = true;
		void readTryDraft()
			.then((draft) => {
				if (active && draft.touched && tryDraftHasContent(draft)) {
					setTryDraft({ scene: draft.scene, notes: draft.notes });
				}
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		if (auth && !auth.authenticated) {
			void appRef.current.redirectToSignIn();
		}
	}, [auth]);

	useEffect(() => {
		const template = searchParams.get("template");
		if (!template || appliedTemplateRef.current === template) {
			return;
		}

		const draft = templateDrafts[template];
		if (!draft) {
			return;
		}

		appliedTemplateRef.current = template;
		setNewProjectTitle(draft.title);
		setNewProjectDescription(draft.description);
	}, [searchParams]);

	useEffect(() => {
		setSelectedWorkspaceId((current) =>
			current && workspaces.some((workspace) => workspace.id === current)
				? current
				: workspaces[0]?.id ?? null,
		);
	}, [workspaces]);

	async function refresh() {
		setLocalError(null);
		await Promise.all([
			mutateWorkspaces(),
			mutateGithubStatus(),
			mutateProjects(),
		]);
	}

	async function handleSyncProjectIndex() {
		if (!selectedWorkspace) return;

		setSyncingIndex(true);
		setLocalError(null);

		try {
			const response = await syncWorkspaceProjectsMetadata(selectedWorkspace.id);
			await mutateProjects(response, { revalidate: false });
			await mutateWorkspaces();
		} catch (syncError) {
			setLocalError(
				syncError instanceof Error
					? friendlyError(syncError.message)
					: "Project index could not be updated",
			);
		} finally {
			setSyncingIndex(false);
		}
	}

	async function handleImportTryDraft() {
		if (!tryDraft) return;
		setImportingTry(true);
		const created = await handleCreateProject({
			title: "Scratch sketch",
			scene: tryDraft.scene,
			notes: tryDraft.notes,
		});
		if (created) {
			await clearTryDraft();
			setTryDraft(null);
		}
		setImportingTry(false);
	}

	async function discardTryDraft() {
		await clearTryDraft();
		setTryDraft(null);
	}

	async function handleCreateProject(seed?: { title: string; scene: SketchScene | null; notes: string | null }) {
		if (!selectedWorkspace) return false;

		setCreatingProject(true);
		setLocalError(null);

		const title = seed?.title ?? (newProjectTitle.trim() || "Untitled Project");
		const baseProjectId = slugify(title);
		// A seeded import must not collide with an existing folder.
		const taken = new Set(projects.map((project) => project.id));
		let projectId = baseProjectId;
		for (let suffix = 2; seed && taken.has(projectId); suffix += 1) {
			projectId = `${baseProjectId}-${suffix}`;
		}
		const now = new Date().toISOString();

		const localProject: WorkspaceProject = {
			id: projectId,
			title,
			description: newProjectDescription.trim() || undefined,
			visibility: selectedWorkspace.visibility,
			createdAt: now,
			updatedAt: now,
			defaultSketch: `projects/${projectId}/sketches/${DEFAULT_SKETCH_ID}.excalidraw.json`,
			defaultSketchId: DEFAULT_SKETCH_ID,
			notesFile: `projects/${projectId}/docs/notes.md`,
			projectFile: `projects/${projectId}/project.json`,
			sketches: [
				{
					id: DEFAULT_SKETCH_ID,
					title: humanizeSlug(DEFAULT_SKETCH_ID),
					file: `projects/${projectId}/sketches/${DEFAULT_SKETCH_ID}.excalidraw.json`,
				},
			],
			sharing: {
				enabled: selectedWorkspace.visibility === "public",
				embed: selectedWorkspace.visibility === "public",
			},
			isLocalOnly: true,
		};

		try {
			// 1. Instant local persistence in IndexedDB (<2ms)
			const currentDraft = draftKey(selectedWorkspace.id, projectId, DEFAULT_SKETCH_ID, auth?.user?.id);
			await Promise.all([
				setDraft(currentDraft, {
					scene: seed?.scene ?? {
						type: "excalidraw",
						version: 2,
						source: "https://sketchflow.space",
						elements: [],
						appState: { viewBackgroundColor: "#000000" },
						files: {},
					},
					updatedAt: now,
				}),
				setDraft(`${currentDraft}:notes`, {
					notes: seed?.notes?.trim() ? seed.notes : `# ${title}\n\nProject documentation and notes.\n`,
					updatedAt: now,
				}),
				setDraft(`${currentDraft}:state`, {
					state: {
						viewMode: "split",
						lastActiveSketchId: DEFAULT_SKETCH_ID,
						panelSizes: [50, 50],
					},
					updatedAt: now,
				}),
				saveLocalProject(selectedWorkspace.id, localProject, auth?.user?.id),
			]);

			// 2. Queue background GitHub commit without blocking UI!
			void queueCreateProject(
				selectedWorkspace.id,
				{
					title,
					description: seed ? undefined : newProjectDescription.trim() || undefined,
					projectId,
					sketchId: DEFAULT_SKETCH_ID,
					visibility: selectedWorkspace.visibility,
				},
				auth?.user?.id,
			).catch((err) => {
				console.warn("[sync] Background project commit queued:", err);
			});

			setNewProjectTitle("");
			setNewProjectDescription("");

			// 3. Immediately navigate to the sketch canvas!
			router.push(sketchHref(selectedWorkspace.id, projectId, DEFAULT_SKETCH_ID));
			return true;
		} catch (err) {
			setLocalError(err instanceof Error ? err.message : "Failed to create project");
			return false;
		} finally {
			setCreatingProject(false);
		}
	}

	const newProjectSlug = slugify(newProjectTitle || "untitled-project");
	const isInitialLoading = workspacesLoading && workspaces.length === 0;

	return (
		<AppShell
			title="Projects"
			subtitle={selectedWorkspace ? `${selectedWorkspace.repoOwner}/${selectedWorkspace.repoName}` : undefined}
			syncLabel={selectedWorkspace ? `${selectedWorkspace.defaultBranch} @ ${shortSha(selectedWorkspace.latestCommitSha)}` : undefined}
			workspaces={workspaces}
			selectedWorkspaceId={selectedWorkspace?.id ?? null}
			onWorkspaceChange={setSelectedWorkspaceId}
			githubUnreachable={githubStatus?.connected === false || Boolean(pageError?.toLowerCase().includes("github"))}
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
				{pageError ? (
					pageError.toLowerCase().includes("github") ? (
						<GithubAccessCard
							scopes={githubStatus?.scopes}
							onRecovered={async () => {
								await refresh();
							}}
						/>
					) : (
						<Notice>{pageError}</Notice>
					)
				) : null}

				{tryDraft ? (
					<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rule bg-card p-3 sm:p-4" role="status">
						<div className="min-w-0">
							<h2 className="flex items-center gap-2 text-sm font-bold">
								<StateGlyph state="local" />
								You have a sketch from Try it
							</h2>
							<p className="mt-0.5 text-sm text-muted-foreground">
								{selectedWorkspace
									? "It is still only in this browser. Import it as a project to save it to your repository."
									: "It is still only in this browser. Set up a workspace below, then import it as a project."}
							</p>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<Button variant="ghost" size="sm" onClick={() => void discardTryDraft()} disabled={importingTry}>
								Discard
							</Button>
							<Button size="sm" onClick={() => void handleImportTryDraft()} disabled={!selectedWorkspace || importingTry}>
								{importingTry ? <Loader2 className="animate-spin" /> : <Plus />}
								Import as a project
							</Button>
						</div>
					</div>
				) : null}

				{selectedWorkspace ? (
					<>
						<form
							className="rounded-lg border border-rule bg-card p-3 sm:p-4"
							onSubmit={(event) => {
								event.preventDefault();
								void handleCreateProject();
							}}
						>
							<h2 className="text-sm font-bold">New project</h2>
							<div className="mt-2.5 grid gap-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
								<div>
									<label htmlFor="new-project-title" className="legend-label mb-1 block">Title</label>
									<Input
										id="new-project-title"
										value={newProjectTitle}
										onChange={(event) => setNewProjectTitle(event.target.value)}
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
										value={newProjectDescription}
										onChange={(event) => setNewProjectDescription(event.target.value)}
										placeholder="What this sketch explains"
										autoComplete="off"
									/>
								</div>
								<Button type="submit" disabled={creatingProject} className="self-end">
									{creatingProject ? <Loader2 className="animate-spin" /> : <Plus />}
									Create project
								</Button>
							</div>
							<p className="mt-2.5 text-xs text-muted-foreground">
								Opens straight away in this browser, then commits to{" "}
								<span className="datum text-foreground">projects/{newProjectSlug}</span> in your repository.
							</p>
						</form>

						<section aria-labelledby="projects-heading" className="space-y-3">
							<div className="flex flex-wrap items-end justify-between gap-3">
								<div>
									<h2 id="projects-heading" className="text-sm font-bold">
										{filteredProjects.length} {filteredProjects.length === 1 ? "project" : "projects"}
										{projectSearch.trim() ? ` matching "${projectSearch.trim()}"` : ""}
									</h2>
									<p className="mt-0.5 text-xs text-muted-foreground">
										{selectedWorkspace.visibility === "public" ? "Public" : "Private"} repository on{" "}
										<span className="datum">{selectedWorkspace.defaultBranch}</span>
										{metadataPresent ? "" : " · project index not written yet"}
									</p>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<Button variant="outline" size="sm" asChild>
										<Link href={repoFolderHref(selectedWorkspace, "projects")} target="_blank" rel="noopener noreferrer">
											<FolderOpen />
											Open on GitHub
										</Link>
									</Button>
									<Button
										variant="outline"
										size="sm"
										disabled={syncingIndex}
										onClick={handleSyncProjectIndex}
										title="Rewrite projects/projects-metadata.json from the project folders in the repository"
									>
										{syncingIndex ? <Loader2 className="animate-spin" /> : <GitCommit />}
										Rebuild index
									</Button>
								</div>
							</div>

							{projectError && !projectError.toLowerCase().includes("github") ? <Notice>{projectError}</Notice> : null}

							{projectsLoading && projects.length === 0 ? (
								<ProjectListSkeleton />
							) : filteredProjects.length > 0 ? (
								<ProjectList projects={filteredProjects} workspace={selectedWorkspace} />
							) : projectSearch.trim() ? (
								<EmptyPanel
									title="No projects match that search"
									action={
										<Button variant="outline" size="sm" onClick={() => setProjectSearch("")}>
											Clear search
										</Button>
									}
								>
									Search looks at project titles, descriptions, folder names and sketch names.
								</EmptyPanel>
							) : (
								<EmptyPanel title="No projects yet">
									A project is a folder in your repository holding one sketch and its notes. Give the first one a
									title above and it opens in the editor.
								</EmptyPanel>
							)}
						</section>
					</>
				) : isInitialLoading || loading ? (
					<ProjectListSkeleton />
				) : (
					<EmptyPanel
						title="Connect a repository to start"
						action={
							<Button asChild>
								<Link href="/app/workspace?new=1">
									<Plus />
									Set up a workspace
								</Link>
							</Button>
						}
					>
						A workspace is one GitHub repository that you own. Sketchflow saves every sketch and note there as plain
						files, so your work stays yours.
					</EmptyPanel>
				)}
			</div>
		</AppShell>
	);
}
