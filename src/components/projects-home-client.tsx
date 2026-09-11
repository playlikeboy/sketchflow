"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useStackApp } from "@stackframe/stack";
import {
	ArrowRight,
	Code2,
	FileText,
	FolderOpen,
	GitCommit,
	Globe,
	KeyRound,
	Loader2,
	Plus,
	RefreshCw,
	SlidersHorizontal,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { GithubAccessCard } from "@/components/github-access-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	syncWorkspaceProjectsMetadata,
	ApiError,
	type Workspace,
} from "@/lib/api";
import type { WorkspaceProject } from "@/lib/project-metadata";
import { slugify, draftKey, humanizeSlug } from "@/lib/sketchflow";
import { saveLocalProject, setDraft } from "@/lib/indexeddb";
import { queueCreateProject } from "@/lib/sync-manager";
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

function firstSketchId(project: WorkspaceProject) {
	return project.defaultSketchId || project.sketches[0]?.id || DEFAULT_SKETCH_ID;
}

function formatDate(value: string) {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "Recently" : date.toLocaleDateString();
}

function projectDescription(project: WorkspaceProject) {
	return project.description || `${project.sketches.length} sketch${project.sketches.length === 1 ? "" : "es"}`;
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
	const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
	const [syncingIndex, setSyncingIndex] = useState(false);
	const [newProjectTitle, setNewProjectTitle] = useState("");
	const [newProjectDescription, setNewProjectDescription] = useState("");
	const [creatingProject, setCreatingProject] = useState(false);
	const [projectSearch, setProjectSearch] = useState("");
	const [localError, setLocalError] = useState<string | null>(null);
	const appliedTemplateRef = useRef<string | null>(null);

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

	async function handleCreateProject() {
		if (!selectedWorkspace) return;

		setCreatingProject(true);
		setLocalError(null);

		const title = newProjectTitle.trim() || "Untitled Project";
		const projectId = slugify(title);
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
					scene: {
						type: "excalidraw",
						version: 2,
						source: "https://sketchflow.space",
						elements: [],
						appState: { viewBackgroundColor: "#ffffff" },
						files: {},
					},
					updatedAt: now,
				}),
				setDraft(`${currentDraft}:notes`, {
					notes: `# ${title}\n\nProject created offline first.\n`,
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
					description: newProjectDescription.trim() || undefined,
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
		} catch (err) {
			setLocalError(err instanceof Error ? err.message : "Failed to create project");
		} finally {
			setCreatingProject(false);
		}
	}

	const newProjectSlug = slugify(newProjectTitle || "untitled-project");
	const isInitialLoading = workspacesLoading && workspaces.length === 0;

	return (
		<AppShell
			title="Projects"
			subtitle={
				selectedWorkspace
					? `${selectedWorkspace.repoOwner}/${selectedWorkspace.repoName}`
					: "Choose a workspace to see projects"
			}
			syncLabel={selectedWorkspace ? `Synced ${shortSha(selectedWorkspace.latestCommitSha)}` : undefined}
			workspaces={workspaces}
			selectedWorkspaceId={selectedWorkspace?.id ?? null}
			onWorkspaceChange={setSelectedWorkspaceId}
			searchValue={projectSearch}
			onSearchChange={setProjectSearch}
			searchPlaceholder="Search projects, sketches, docs"
			action={
				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						size="icon"
						onClick={() => void refresh()}
						aria-label="Refresh projects"
					>
						{syncingIndex ? (
							<Loader2 className="size-4 animate-spin text-[#58CC02]" />
						) : (
							<RefreshCw className="size-4" />
						)}
					</Button>
					<Link
						href="/app/workspace"
						className="btn-3d btn-3d--secondary h-9 px-3.5 text-xs font-extrabold cursor-pointer flex items-center justify-center gap-1.5"
					>
						<SlidersHorizontal className="size-4" />
						Workspace
					</Link>
				</div>
			}
		>
			<div className="mx-auto flex max-w-7xl flex-col gap-5">
				{pageError ? (
					pageError.toLowerCase().includes("github") ? (
						<GithubAccessCard
							scopes={githubStatus?.scopes}
							onRecovered={async () => {
								await refresh();
							}}
						/>
					) : (
						<div className="rounded-[16px] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
							{pageError}
						</div>
					)
				) : null}

				{selectedWorkspace ? (
					<section className="space-y-4">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div className="flex min-w-0 flex-wrap items-center gap-2">
								<Badge variant="secondary">
									{filteredProjects.length} project{filteredProjects.length === 1 ? "" : "s"}
								</Badge>
								<Badge variant="outline">{selectedWorkspace.visibility}</Badge>
								<Badge variant="outline">{selectedWorkspace.defaultBranch}</Badge>
								<Badge variant={metadataPresent ? "secondary" : "outline"}>
									{metadataPresent ? "Indexed" : "Index pending"}
								</Badge>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<Button variant="outline" size="sm" asChild>
									<Link href={repoFolderHref(selectedWorkspace, "projects")} target="_blank">
										<FolderOpen className="size-4" />
										Repo
									</Link>
								</Button>
								<button
									className="btn-3d btn-3d--secondary h-9 px-3.5 text-xs font-extrabold cursor-pointer flex items-center justify-center gap-1.5"
									disabled={syncingIndex}
									onClick={handleSyncProjectIndex}
								>
									{syncingIndex ? (
										<Loader2 className="size-4 animate-spin text-[#58CC02]" />
									) : (
										<GitCommit className="size-4" />
									)}
									Sync
								</button>
							</div>
						</div>

						{projectError && !projectError.toLowerCase().includes("github") ? (
							<div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
								<span className="inline-flex items-center gap-2">
									<KeyRound className="size-4" />
									{projectError}
								</span>
							</div>
						) : null}

						<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
							<Card className="min-h-[260px] border-dashed bg-muted/30">
								<CardHeader>
									<div className="flex items-center justify-between gap-3">
										<div>
											<CardTitle>Create project</CardTitle>
											<CardDescription>
												Instant local canvas, auto-synced to GitHub.
											</CardDescription>
										</div>
										<div className="grid size-10 place-items-center rounded-[14px] bg-primary/10 text-primary">
											<Plus className="size-5" />
										</div>
									</div>
								</CardHeader>
								<CardContent className="flex flex-1 flex-col gap-3">
									<Input
										value={newProjectTitle}
										onChange={(event) => setNewProjectTitle(event.target.value)}
										aria-label="Project title"
										placeholder="Project title"
									/>
									<Input
										value={newProjectDescription}
										onChange={(event) => setNewProjectDescription(event.target.value)}
										aria-label="Project description"
										placeholder="Short description (optional)"
									/>
									<div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
										<span className="truncate text-xs font-semibold text-muted-foreground">
											projects/{newProjectSlug}
										</span>
										<button
											className="btn-3d btn-3d--primary h-10 px-4 text-xs font-extrabold cursor-pointer flex items-center justify-center gap-1.5"
											disabled={creatingProject}
											onClick={handleCreateProject}
										>
											{creatingProject ? (
												<Loader2 className="size-4 animate-spin" />
											) : (
												<Plus className="size-4" />
											)}
											Create
										</button>
									</div>
								</CardContent>
							</Card>

							{filteredProjects.map((project) => (
								<Card key={project.id} className="min-h-[260px] transition-colors hover:border-primary/60">
									<CardHeader>
										<div className="flex items-start justify-between gap-3">
											<div className="min-w-0">
												<div className="flex items-center gap-2">
													<CardTitle className="truncate">{project.title}</CardTitle>
													{project.isLocalOnly && (
														<span className="relative flex h-2 w-2 shrink-0" title="Offline (Saved Locally)">
															<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
															<span className="relative inline-flex rounded-full h-2 w-2 bg-[#58CC02]"></span>
														</span>
													)}
												</div>
												<CardDescription className="line-clamp-2">
													{projectDescription(project)}
												</CardDescription>
											</div>
											<div className="flex flex-col items-end gap-1.5 shrink-0">
												<Badge variant={project.visibility === "public" ? "default" : "outline"}>
													{project.visibility}
												</Badge>
												{project.isLocalOnly && (
													<Badge variant="outline" className="text-[#58CC02] border-[#58CC02] text-[9px] py-0.5 px-1.5 font-extrabold uppercase tracking-wide">
														Local
													</Badge>
												)}
											</div>
										</div>
									</CardHeader>
									<CardContent className="flex flex-1 flex-col gap-4">
										<div className="grid gap-2 rounded-[14px] border bg-muted/40 p-3 text-xs font-semibold text-muted-foreground">
											<div className="flex items-center justify-between gap-3">
												<span>Folder</span>
												<span className="truncate font-mono text-foreground">projects/{project.id}</span>
											</div>
											<div className="flex items-center justify-between gap-3">
												<span>Updated</span>
												<span className="text-foreground">{formatDate(project.updatedAt)}</span>
											</div>
										</div>
										<div className="mt-auto flex flex-wrap items-center gap-2">
											<Link
												href={sketchHref(selectedWorkspace.id, project.id, firstSketchId(project))}
												className="btn-3d btn-3d--primary h-9 px-3.5 text-xs font-extrabold cursor-pointer flex items-center justify-center gap-1.5"
											>
												<ArrowRight className="size-4" />
												Open
											</Link>
											<Button variant="outline" size="icon-sm" asChild>
												<Link
													href={repoFolderHref(selectedWorkspace, `projects/${project.id}`)}
													target="_blank"
													aria-label={`Open ${project.title} files on GitHub`}
												>
													<FolderOpen className="size-4" />
												</Link>
											</Button>
											<Button variant="outline" size="icon-sm" asChild>
												<Link
													href={repoFileHref(selectedWorkspace, project.notesFile)}
													target="_blank"
													aria-label={`Open ${project.title} notes on GitHub`}
												>
													<FileText className="size-4" />
												</Link>
											</Button>
											{project.visibility === "public" && selectedWorkspace.visibility === "public" ? (
												<>
													<Button variant="outline" size="icon-sm" asChild>
														<Link href={shareHref(selectedWorkspace, project.id)} target="_blank" aria-label={`Share ${project.title}`}>
															<Globe className="size-4" />
														</Link>
													</Button>
													<Button variant="outline" size="icon-sm" asChild>
														<Link href={embedHref(selectedWorkspace, project.id)} target="_blank" aria-label={`Embed ${project.title}`}>
															<Code2 className="size-4" />
														</Link>
													</Button>
												</>
											) : null}
										</div>
									</CardContent>
								</Card>
							))}
						</div>

						{filteredProjects.length === 0 ? (
							<div className="rounded-[16px] border bg-muted/40 px-4 py-3 text-sm font-semibold text-muted-foreground">
								No projects match that search. Clear the search or create a new project above.
							</div>
						) : null}
					</section>
				) : isInitialLoading ? (
					<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
						{[0, 1, 2].map((item) => (
							<div key={item} className="min-h-[260px] animate-pulse rounded-[16px] bg-muted" />
						))}
					</section>
				) : (
					<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
						<Card className="md:col-span-2 xl:col-span-1">
							<CardHeader>
								<CardTitle>Create your first workspace</CardTitle>
								<CardDescription>Connect GitHub to create your project repository.</CardDescription>
							</CardHeader>
							<CardContent className="flex flex-wrap gap-2">
								<Button asChild>
									<Link href="/app/workspace">
										<Plus className="size-4" />
										New workspace
									</Link>
								</Button>
							</CardContent>
						</Card>
					</section>
				)}
			</div>
		</AppShell>
	);
}
