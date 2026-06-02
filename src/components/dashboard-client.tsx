"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStackApp } from "@stackframe/stack";
import {
	ArrowRight,
	Clock3,
	Code2,
	FileText,
	FolderOpen,
	GitCommit,
	GitPullRequest,
	Globe,
	Layers3,
	Loader2,
	Plus,
	RefreshCw,
	ShieldCheck,
	Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { Input } from "@/components/ui/input";
import { WorkspaceAdvancedOptions } from "@/components/workspace-advanced-options";
import {
	bootstrapWorkspace,
	createWorkspaceProject,
	getAuthMe,
	getGithubStatus,
	getWorkspaceProjects,
	getWorkspaces,
	syncWorkspaceProjectsMetadata,
	type GithubStatus,
	type Workspace,
} from "@/lib/api";
import { connectGithubAccount } from "@/lib/github-connect";
import type { WorkspaceProject } from "@/lib/project-metadata";
import { slugify } from "@/lib/sketchflow";
import {
	DEFAULT_PROJECT_ID,
	DEFAULT_SKETCH_ID,
	commitsHref,
	embedHref,
	repoFileHref,
	repoFolderHref,
	repoHref,
	shareHref,
	sketchHref,
} from "@/lib/workspace-routes";

function shortSha(value: string | null) {
	return value ? value.slice(0, 7) : "pending";
}

function connectionCopy(status: GithubStatus | null) {
	return status?.connected ? status.github.login : "Connect GitHub";
}

function friendlyError(message: string) {
	if (message.toLowerCase().includes("github")) {
		return "GitHub needs one more connection step. Reconnect and approve access to continue.";
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

export function DashboardClient() {
	const app = useStackApp();
	const appRef = useRef(app);
	const router = useRouter();
	const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
	const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
	const [projects, setProjects] = useState<WorkspaceProject[]>([]);
	const [projectsLoading, setProjectsLoading] = useState(false);
	const [projectsError, setProjectsError] = useState<string | null>(null);
	const [metadataPresent, setMetadataPresent] = useState(false);
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
	const [githubStatus, setGithubStatus] = useState<GithubStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [repoName, setRepoName] = useState("sketchflow-workspace");
	const [isPrivate, setIsPrivate] = useState(false);
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const [bootstrapping, setBootstrapping] = useState(false);
	const [connectingGithub, setConnectingGithub] = useState(false);
	const [quickProjectName, setQuickProjectName] = useState(DEFAULT_PROJECT_ID);
	const [quickSketchName, setQuickSketchName] = useState(DEFAULT_SKETCH_ID);
	const [newProjectTitle, setNewProjectTitle] = useState("");
	const [newProjectDescription, setNewProjectDescription] = useState("");
	const [creatingProject, setCreatingProject] = useState(false);
	const [projectSearch, setProjectSearch] = useState("");

	const selectedWorkspace = useMemo(
		() => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? workspaces[0] ?? null,
		[selectedWorkspaceId, workspaces],
	);
	const selectedProject = useMemo(
		() => projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null,
		[selectedProjectId, projects],
	);
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
	const githubConnected = githubStatus?.connected === true;

	useEffect(() => {
		appRef.current = app;
	}, [app]);

	const loadProjects = useCallback(async (workspaceId: string) => {
		setProjectsLoading(true);
		setProjectsError(null);

		try {
			const response = await getWorkspaceProjects(workspaceId);
			let nextResponse = response;

			if (!response.metadataPresent) {
				try {
					nextResponse = await syncWorkspaceProjectsMetadata(workspaceId);
				} catch (syncError) {
					setProjectsError(
						syncError instanceof Error
							? friendlyError(syncError.message)
							: "Project index could not be written",
					);
				}
			}

			setProjects(nextResponse.projects);
			setMetadataPresent(nextResponse.metadataPresent);
			setSelectedProjectId((current) =>
				current && nextResponse.projects.some((project) => project.id === current)
					? current
					: nextResponse.projects[0]?.id ?? null,
			);
			setWorkspaces((current) =>
				current.map((workspace) =>
					workspace.id === nextResponse.workspace.id ? nextResponse.workspace : workspace,
				),
			);
		} catch (projectError) {
			setProjects([]);
			setSelectedProjectId(null);
			setMetadataPresent(false);
			setProjectsError(
				projectError instanceof Error
					? friendlyError(projectError.message)
					: "Projects could not be loaded from this repo",
			);
		} finally {
			setProjectsLoading(false);
		}
	}, []);

	const refresh = useCallback(async () => {
		setLoading(true);
		setError(null);

		const auth = await getAuthMe();
		if (!auth.authenticated) {
			await appRef.current.redirectToSignIn();
			return;
		}

		const [workspaceResult, githubResult] = await Promise.allSettled([
			getWorkspaces(),
			getGithubStatus(),
		]);

		if (workspaceResult.status === "fulfilled") {
			const nextWorkspaces = workspaceResult.value.workspaces;
			setWorkspaces(nextWorkspaces);
			setSelectedWorkspaceId((current) =>
				current && nextWorkspaces.some((workspace) => workspace.id === current)
					? current
					: nextWorkspaces[0]?.id ?? null,
			);
		} else {
			setError(
				workspaceResult.reason instanceof Error
					? friendlyError(workspaceResult.reason.message)
					: "Workspace data is temporarily unavailable",
			);
		}

		if (githubResult.status === "fulfilled") {
			setGithubStatus(githubResult.value);
		} else {
			setGithubStatus(null);
		}

		setLoading(false);
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	useEffect(() => {
		if (!selectedWorkspaceId) {
			setProjects([]);
			setSelectedProjectId(null);
			setMetadataPresent(false);
			return;
		}

		void loadProjects(selectedWorkspaceId);
	}, [loadProjects, selectedWorkspaceId]);

	async function handleBootstrap() {
		setBootstrapping(true);
		setError(null);

		try {
			const response = await bootstrapWorkspace({ repoName, private: isPrivate });
			setWorkspaces((current) => [
				response.workspace,
				...current.filter((workspace) => workspace.id !== response.workspace.id),
			]);
			setSelectedWorkspaceId(response.workspace.id);
			void loadProjects(response.workspace.id);
		} catch (bootstrapError) {
			setError(
				bootstrapError instanceof Error
					? friendlyError(bootstrapError.message)
					: "Workspace creation did not finish",
			);
		} finally {
			setBootstrapping(false);
		}
	}

	async function handleConnectGithub() {
		setConnectingGithub(true);
		setError(null);

		try {
			await connectGithubAccount(app, githubStatus?.scopes);
			const nextStatus = await getGithubStatus();
			setGithubStatus(nextStatus);

			if (!nextStatus.connected) {
				setError("GitHub needs one more connection step. Reconnect and approve access to continue.");
			}
		} catch (connectError) {
			setError(
				connectError instanceof Error
					? friendlyError(connectError.message)
					: "GitHub connection did not finish",
			);
		} finally {
			setConnectingGithub(false);
		}
	}

	async function handleSyncProjectIndex() {
		if (!selectedWorkspace) return;

		setProjectsLoading(true);
		setProjectsError(null);

		try {
			const response = await syncWorkspaceProjectsMetadata(selectedWorkspace.id);
			setProjects(response.projects);
			setMetadataPresent(true);
			setSelectedProjectId((current) =>
				current && response.projects.some((project) => project.id === current)
					? current
					: response.projects[0]?.id ?? null,
			);
			setWorkspaces((current) =>
				current.map((workspace) =>
					workspace.id === response.workspace.id ? response.workspace : workspace,
				),
			);
		} catch (syncError) {
			setProjectsError(
				syncError instanceof Error
					? friendlyError(syncError.message)
					: "Project index could not be updated",
			);
		} finally {
			setProjectsLoading(false);
		}
	}

	async function handleCreateProject() {
		if (!selectedWorkspace) return;

		setCreatingProject(true);
		setProjectsError(null);

		try {
			const title = newProjectTitle.trim() || "Untitled Project";
			const response = await createWorkspaceProject({
				workspaceId: selectedWorkspace.id,
				title,
				description: newProjectDescription.trim() || undefined,
				projectId: slugify(title),
				sketchId: DEFAULT_SKETCH_ID,
				visibility: selectedWorkspace.visibility,
			});
			const createdProject = response.projects.find((project) => project.id === slugify(title));

			setProjects(response.projects);
			setMetadataPresent(true);
			setSelectedProjectId(createdProject?.id ?? response.projects[0]?.id ?? null);
			setWorkspaces((current) =>
				current.map((workspace) =>
					workspace.id === response.workspace.id ? response.workspace : workspace,
				),
			);
			setNewProjectTitle("");
			setNewProjectDescription("");

			if (createdProject) {
				router.push(sketchHref(selectedWorkspace.id, createdProject.id, firstSketchId(createdProject)));
			}
		} catch (createError) {
			setProjectsError(
				createError instanceof Error
					? friendlyError(createError.message)
					: "Project could not be created",
			);
		} finally {
			setCreatingProject(false);
		}
	}

	function openCanvasFromQuickAction() {
		if (!selectedWorkspace) return;

		router.push(
			sketchHref(
				selectedWorkspace.id,
				slugify(quickProjectName || DEFAULT_PROJECT_ID),
				slugify(quickSketchName || DEFAULT_SKETCH_ID),
			),
		);
	}

	const quickProjectId = selectedProject?.id ?? slugify(quickProjectName || DEFAULT_PROJECT_ID);

	return (
		<AppShell
			title="Workspace"
			subtitle={
				selectedWorkspace
					? `${selectedWorkspace.repoOwner}/${selectedWorkspace.repoName}`
					: "Create a GitHub-backed canvas workspace"
			}
			syncLabel={
				selectedWorkspace ? `Synced ${shortSha(selectedWorkspace.latestCommitSha)}` : undefined
			}
			workspaces={workspaces}
			selectedWorkspaceId={selectedWorkspace?.id ?? null}
			onWorkspaceChange={setSelectedWorkspaceId}
			searchValue={projectSearch}
			onSearchChange={setProjectSearch}
			action={
				<Button
					variant="ghost"
					size="icon"
					onClick={() => void refresh()}
					aria-label="Refresh workspace data"
				>
					{loading ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<RefreshCw className="size-4" />
					)}
				</Button>
			}
		>
			<div className="grid gap-5 xl:grid-cols-[1fr_360px]">
				<section className="space-y-5">
					<div className="grid gap-3 md:grid-cols-3">
						<Card size="sm">
							<CardHeader>
								<div className="flex items-center justify-between">
									<CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
										GitHub
									</CardTitle>
									<GitPullRequest className="size-4 text-muted-foreground" />
								</div>
							</CardHeader>
							<CardContent>
								<div className="text-xl font-semibold">{connectionCopy(githubStatus)}</div>
							</CardContent>
						</Card>
						<Card size="sm">
							<CardHeader>
								<div className="flex items-center justify-between">
									<CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
										Workspaces
									</CardTitle>
									<ShieldCheck className="size-4 text-muted-foreground" />
								</div>
							</CardHeader>
							<CardContent>
								<div className="text-xl font-semibold">{workspaces.length}</div>
							</CardContent>
						</Card>
						<Card size="sm">
							<CardHeader>
								<div className="flex items-center justify-between">
									<CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
										Projects
									</CardTitle>
									<Layers3 className="size-4 text-muted-foreground" />
								</div>
							</CardHeader>
							<CardContent>
								<div className="text-xl font-semibold">{projectsLoading ? "..." : projects.length}</div>
							</CardContent>
						</Card>
					</div>

					{error ? (
						<div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
							{error}
						</div>
					) : null}

					<Card id="projects">
						<CardHeader>
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div>
									<CardTitle>
										{selectedWorkspace ? `Projects in ${selectedWorkspace.repoName}` : "Projects"}
									</CardTitle>
									<CardDescription>
										A workspace is one GitHub repo. Projects are folders inside its projects directory.
									</CardDescription>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									{githubConnected ? null : (
										<Button
											variant="outline"
											size="sm"
											disabled={connectingGithub}
											onClick={handleConnectGithub}
										>
											{connectingGithub ? (
												<Loader2 className="size-4 animate-spin" />
											) : (
												<GitPullRequest className="size-4" />
											)}
											Connect GitHub
										</Button>
									)}
									{selectedWorkspace ? (
										<Button variant="outline" size="sm" asChild>
											<Link href={repoFolderHref(selectedWorkspace, "projects")} target="_blank">
												<FolderOpen className="size-4" />
												Repo projects
											</Link>
										</Button>
									) : null}
									<Button
										variant="outline"
										size="sm"
										disabled={!selectedWorkspace || projectsLoading}
										onClick={handleSyncProjectIndex}
									>
										{projectsLoading ? (
											<Loader2 className="size-4 animate-spin" />
										) : (
											<GitCommit className="size-4" />
										)}
										Sync index
									</Button>
								</div>
							</div>
						</CardHeader>
						<CardContent>
							{selectedWorkspace ? (
								<>
									<div className="mb-4 flex flex-wrap items-center gap-2">
										<Badge variant="secondary" className="font-normal">
											{selectedWorkspace.repoOwner}/{selectedWorkspace.repoName}
										</Badge>
										<Badge variant="outline" className="font-normal">
											{selectedWorkspace.visibility}
										</Badge>
										<Badge variant="outline" className="font-normal">
											{selectedWorkspace.defaultBranch}
										</Badge>
										<Badge variant={metadataPresent ? "secondary" : "outline"} className="font-normal">
											{metadataPresent ? "projects-metadata.json synced" : "metadata index missing"}
										</Badge>
										{projectSearch ? (
											<Badge variant="outline" className="font-normal">
												{filteredProjects.length} match{filteredProjects.length === 1 ? "" : "es"}
											</Badge>
										) : null}
									</div>

									{projectsError ? (
										<div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
											{projectsError}
										</div>
									) : null}

									{projectsLoading ? (
										<div className="grid gap-3">
											{[0, 1, 2].map((item) => (
												<div key={item} className="h-24 animate-pulse rounded-lg bg-muted" />
											))}
										</div>
									) : filteredProjects.length > 0 ? (
										<div className="divide-y divide-border">
											{filteredProjects.map((project) => (
												<div
													key={project.id}
													className={`grid gap-3 rounded-lg py-4 first:pt-0 last:pb-0 lg:grid-cols-[1fr_auto] ${
														selectedProject?.id === project.id ? "bg-muted/30 px-3" : ""
													}`}
												>
													<div>
														<div className="flex flex-wrap items-center gap-2">
															<span className="font-semibold">{project.title}</span>
															<Badge variant="secondary" className="font-normal">
																{project.visibility}
															</Badge>
														</div>
														<div className="mt-1 text-sm text-muted-foreground">
															projects/{project.id} · {project.sketches.length} sketch
															{project.sketches.length === 1 ? "" : "es"} · updated {formatDate(project.updatedAt)}
														</div>
														<div className="mt-3 grid gap-2 sm:grid-cols-3">
															{[
																{ label: "Default sketch", value: project.defaultSketchId },
																{ label: "Notes", value: project.notesFile },
																{ label: "Project file", value: project.projectFile },
															].map((item) => (
																<div key={item.label} className="rounded-lg border bg-muted/20 px-3 py-2">
																	<div className="text-xs text-muted-foreground">{item.label}</div>
																	<div className="truncate text-sm">{item.value}</div>
																</div>
															))}
														</div>
													</div>
													<div className="flex flex-wrap items-center gap-2">
														<Button
															variant={selectedProject?.id === project.id ? "secondary" : "outline"}
															size="sm"
															onClick={() => setSelectedProjectId(project.id)}
														>
															<Layers3 className="size-4" />
															{selectedProject?.id === project.id ? "Selected" : "Select"}
														</Button>
														<Button variant="outline" size="sm" asChild>
															<Link href={repoFolderHref(selectedWorkspace, `projects/${project.id}`)} target="_blank">
																<FolderOpen className="size-4" />
																Files
															</Link>
														</Button>
														{project.visibility === "public" && selectedWorkspace.visibility === "public" ? (
															<>
																<Button variant="outline" size="sm" asChild>
																	<Link href={shareHref(selectedWorkspace, project.id)} target="_blank">
																		<Globe className="size-4" />
																		Share
																	</Link>
																</Button>
																<Button variant="outline" size="sm" asChild>
																	<Link href={embedHref(selectedWorkspace, project.id)} target="_blank">
																		<Code2 className="size-4" />
																		Embed
																	</Link>
																</Button>
															</>
														) : null}
														<Button size="sm" asChild>
															<Link href={sketchHref(selectedWorkspace.id, project.id, firstSketchId(project))}>
																<ArrowRight className="size-4" />
																Open
															</Link>
														</Button>
													</div>
												</div>
											))}
										</div>
									) : (
										<div className="rounded-lg border bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
											{projects.length > 0
												? "No projects match that search."
												: "No projects found yet. Use the project form to create a project folder."}
										</div>
									)}
								</>
							) : (
								<div className="rounded-lg border bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
									Create or connect a workspace repo. Sketchflow will add the manifest, first project,
									docs, and project metadata index.
								</div>
							)}
						</CardContent>
					</Card>

					<Card id="new-project">
						<CardHeader>
							<CardTitle>New project</CardTitle>
							<CardDescription>
								Create a folder in the selected workspace repo with a starter canvas, notes, assets, and metadata.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="grid gap-3">
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
									placeholder="Short description"
								/>
								<div className="flex flex-wrap items-center justify-between gap-3">
									<div className="text-sm text-muted-foreground">
										{selectedWorkspace
											? `Creates projects/${slugify(newProjectTitle || "untitled-project")}`
											: "Select or create a workspace first."}
									</div>
									<Button
										disabled={!selectedWorkspace || creatingProject}
										onClick={handleCreateProject}
									>
										{creatingProject ? (
											<Loader2 className="size-4 animate-spin" />
										) : (
											<Plus className="size-4" />
										)}
										Create project
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>

					<Card id="new-workspace">
						<CardHeader>
							<CardTitle>New workspace repo</CardTitle>
							<CardDescription>
								Use a separate GitHub repo for a different team, product, client, or public portfolio.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="grid gap-3 lg:grid-cols-[1fr_auto]">
								<div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_auto]">
									<Input
										value={repoName}
										onChange={(event) => setRepoName(event.target.value)}
										aria-label="Repository name"
										placeholder="sketchflow-workspace"
									/>
									<Badge variant="outline" className="h-8 rounded-lg px-3 font-normal">
										Public by default
									</Badge>
								</div>
								<Button disabled={!githubConnected || bootstrapping} onClick={handleBootstrap}>
									{bootstrapping ? (
										<Loader2 className="size-4 animate-spin" />
									) : (
										<Plus className="size-4" />
									)}
									New workspace
								</Button>
							</div>
							<WorkspaceAdvancedOptions
								open={advancedOpen}
								onOpenChange={setAdvancedOpen}
								isPrivate={isPrivate}
								onPrivateChange={setIsPrivate}
								className="mt-2"
							/>
						</CardContent>
					</Card>
				</section>

				<aside className="space-y-4">
					<Card id="recent" size="sm">
						<CardHeader>
							<div className="flex items-center justify-between">
								<CardTitle>Canvas launcher</CardTitle>
								<Sparkles className="size-4 text-primary" />
							</div>
							<CardDescription>
								Open an existing canvas or type new slugs. The first save creates the files in GitHub.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3">
							<div className="grid gap-2">
								<Input
									value={quickProjectName}
									onChange={(event) => setQuickProjectName(event.target.value)}
									placeholder="project-slug"
									aria-label="Project slug"
								/>
								<Input
									value={quickSketchName}
									onChange={(event) => setQuickSketchName(event.target.value)}
									placeholder="sketch-slug"
									aria-label="Sketch slug"
								/>
								<Button
									className="w-full justify-start"
									disabled={!selectedWorkspace}
									onClick={openCanvasFromQuickAction}
								>
									<Plus className="size-4" />
									Open canvas
								</Button>
							</div>

							<div className="grid gap-2 border-t pt-3">
								<Button variant="outline" className="w-full justify-start" disabled={!selectedWorkspace} asChild={Boolean(selectedWorkspace)}>
									{selectedWorkspace ? (
										<Link href={repoFileHref(selectedWorkspace, selectedProject?.notesFile ?? `projects/${quickProjectId}/docs/notes.md`)} target="_blank">
											<FileText className="size-4" />
											Open notes
										</Link>
									) : (
										<>
											<FileText className="size-4" />
											Open notes
										</>
									)}
								</Button>
								<Button variant="outline" className="w-full justify-start" disabled={!selectedWorkspace} asChild={Boolean(selectedWorkspace)}>
									{selectedWorkspace ? (
										<Link href={commitsHref(selectedWorkspace, `projects/${quickProjectId}`)} target="_blank">
											<Clock3 className="size-4" />
											Version history
										</Link>
									) : (
										<>
											<Clock3 className="size-4" />
											Version history
										</>
									)}
								</Button>
								<Button
									variant="outline"
									className="w-full justify-start"
									disabled={!selectedWorkspace || selectedWorkspace.visibility !== "public"}
									asChild={Boolean(selectedWorkspace && selectedWorkspace.visibility === "public")}
								>
									{selectedWorkspace && selectedWorkspace.visibility === "public" ? (
										<Link href={shareHref(selectedWorkspace, quickProjectId)} target="_blank">
											<Globe className="size-4" />
											Share project
										</Link>
									) : (
										<>
											<Globe className="size-4" />
											Share project
										</>
									)}
								</Button>
								<Button
									variant="outline"
									className="w-full justify-start"
									disabled={!selectedWorkspace || selectedWorkspace.visibility !== "public"}
									asChild={Boolean(selectedWorkspace && selectedWorkspace.visibility === "public")}
								>
									{selectedWorkspace && selectedWorkspace.visibility === "public" ? (
										<Link href={embedHref(selectedWorkspace, quickProjectId)} target="_blank">
											<Code2 className="size-4" />
											Embed project
										</Link>
									) : (
										<>
											<Code2 className="size-4" />
											Embed project
										</>
									)}
								</Button>
							</div>
						</CardContent>
					</Card>

					<Card id="docs" size="sm">
						<CardHeader>
							<CardTitle>Repo layout</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-2 font-mono text-xs text-muted-foreground">
								<div>.sketchflow/workspace.json</div>
								<div>projects/projects-metadata.json</div>
								<div>projects/[project]/project.json</div>
								<div>projects/[project]/sketches/[sketch].excalidraw.json</div>
								<div>projects/[project]/docs/notes.md</div>
							</div>
						</CardContent>
					</Card>

					<Card id="public" size="sm">
						<CardHeader>
							<CardTitle>Publishing</CardTitle>
							<CardDescription>Share and embed public project pages from GitHub-backed files.</CardDescription>
						</CardHeader>
						<CardContent className="space-y-2 text-sm text-muted-foreground">
							<div>Public workspace repos can expose project pages.</div>
							<div>Private workspaces stay private unless you make the repo public.</div>
						</CardContent>
					</Card>

					<Card id="templates" size="sm">
						<CardHeader>
							<CardTitle>Templates</CardTitle>
							<CardDescription>Starter systems, product maps, and docs packs will appear here.</CardDescription>
						</CardHeader>
					</Card>
				</aside>
			</div>
		</AppShell>
	);
}
