"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStackApp } from "@stackframe/stack";
import {
	ArrowRight,
	Code2,
	FileText,
	FolderOpen,
	GitCommit,
	GitPullRequest,
	Globe,
	Loader2,
	Plus,
	RefreshCw,
	SlidersHorizontal,
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
import {
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
	DEFAULT_SKETCH_ID,
	embedHref,
	repoFileHref,
	repoFolderHref,
	shareHref,
	sketchHref,
} from "@/lib/workspace-routes";

function shortSha(value: string | null) {
	return value ? value.slice(0, 7) : "pending";
}

function friendlyError(message: string) {
	if (message.toLowerCase().includes("github")) {
		return "GitHub is almost connected. Reconnect once and approve access to continue.";
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
	return project.description || `${project.sketches.length} sketch${project.sketches.length === 1 ? "" : "es"} in this project`;
}

export function ProjectsHomeClient() {
	const app = useStackApp();
	const appRef = useRef(app);
	const router = useRouter();
	const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
	const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
	const [projects, setProjects] = useState<WorkspaceProject[]>([]);
	const [metadataPresent, setMetadataPresent] = useState(false);
	const [githubStatus, setGithubStatus] = useState<GithubStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [projectsLoading, setProjectsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [projectsError, setProjectsError] = useState<string | null>(null);
	const [connectingGithub, setConnectingGithub] = useState(false);
	const [newProjectTitle, setNewProjectTitle] = useState("");
	const [newProjectDescription, setNewProjectDescription] = useState("");
	const [creatingProject, setCreatingProject] = useState(false);
	const [projectSearch, setProjectSearch] = useState("");

	const selectedWorkspace = useMemo(
		() => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? workspaces[0] ?? null,
		[selectedWorkspaceId, workspaces],
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
				nextResponse = await syncWorkspaceProjectsMetadata(workspaceId);
			}

			setProjects(nextResponse.projects);
			setMetadataPresent(nextResponse.metadataPresent);
			setWorkspaces((current) =>
				current.map((workspace) =>
					workspace.id === nextResponse.workspace.id ? nextResponse.workspace : workspace,
				),
			);
		} catch (projectError) {
			setProjects([]);
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
			setMetadataPresent(false);
			return;
		}

		void loadProjects(selectedWorkspaceId);
	}, [loadProjects, selectedWorkspaceId]);

	async function handleConnectGithub() {
		setConnectingGithub(true);
		setError(null);

		try {
			await connectGithubAccount(app, githubStatus?.scopes);
			setGithubStatus(await getGithubStatus());
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
			const projectId = slugify(title);
			const response = await createWorkspaceProject({
				workspaceId: selectedWorkspace.id,
				title,
				description: newProjectDescription.trim() || undefined,
				projectId,
				sketchId: DEFAULT_SKETCH_ID,
				visibility: selectedWorkspace.visibility,
			});
			const createdProject = response.projects.find((project) => project.id === projectId);

			setProjects(response.projects);
			setMetadataPresent(true);
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

	const newProjectSlug = slugify(newProjectTitle || "untitled-project");

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
						{loading ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							<RefreshCw className="size-4" />
						)}
					</Button>
					<Button variant="outline" size="sm" asChild>
						<Link href="/app/workspace">
							<SlidersHorizontal className="size-4" />
							Workspace
						</Link>
					</Button>
				</div>
			}
		>
			<div className="mx-auto flex max-w-7xl flex-col gap-5">
				{error ? (
					<div className="rounded-[16px] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
						{error}
					</div>
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
								<Button
									variant="outline"
									size="sm"
									disabled={projectsLoading}
									onClick={handleSyncProjectIndex}
								>
									{projectsLoading ? (
										<Loader2 className="size-4 animate-spin" />
									) : (
										<GitCommit className="size-4" />
									)}
									Sync
								</Button>
							</div>
						</div>

						{projectsError ? (
							<div className="rounded-[16px] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
								{projectsError}
							</div>
						) : null}

						<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
							<Card className="min-h-[280px] border-dashed bg-muted/35">
								<CardHeader>
									<div className="flex items-center justify-between gap-3">
										<div>
											<CardTitle>Create project</CardTitle>
											<CardDescription>
												Add a new folder with a canvas, notes, assets, and metadata.
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
										placeholder="Short description"
									/>
									<div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
										<span className="truncate text-xs font-semibold text-muted-foreground">
											projects/{newProjectSlug}
										</span>
										<Button disabled={creatingProject} onClick={handleCreateProject}>
											{creatingProject ? (
												<Loader2 className="size-4 animate-spin" />
											) : (
												<Plus className="size-4" />
											)}
											Create
										</Button>
									</div>
								</CardContent>
							</Card>

							{projectsLoading
								? [0, 1, 2].map((item) => (
										<div key={item} className="min-h-[280px] animate-pulse rounded-[16px] bg-muted" />
									))
								: filteredProjects.map((project) => (
										<Card key={project.id} className="min-h-[280px] transition-colors hover:border-primary/60">
											<CardHeader>
												<div className="flex items-start justify-between gap-3">
													<div className="min-w-0">
														<CardTitle className="truncate">{project.title}</CardTitle>
														<CardDescription className="line-clamp-2">
															{projectDescription(project)}
														</CardDescription>
													</div>
													<Badge variant={project.visibility === "public" ? "default" : "outline"}>
														{project.visibility}
													</Badge>
												</div>
											</CardHeader>
											<CardContent className="flex flex-1 flex-col gap-4">
												<div className="grid gap-2 rounded-[14px] border bg-muted/50 p-3 text-xs font-semibold text-muted-foreground">
													<div className="flex items-center justify-between gap-3">
														<span>Folder</span>
														<span className="truncate font-mono text-foreground">projects/{project.id}</span>
													</div>
													<div className="flex items-center justify-between gap-3">
														<span>Sketch</span>
														<span className="truncate font-mono text-foreground">{project.defaultSketchId}</span>
													</div>
													<div className="flex items-center justify-between gap-3">
														<span>Updated</span>
														<span className="text-foreground">{formatDate(project.updatedAt)}</span>
													</div>
												</div>
												<div className="mt-auto flex flex-wrap items-center gap-2">
													<Button size="sm" asChild>
														<Link href={sketchHref(selectedWorkspace.id, project.id, firstSketchId(project))}>
															<ArrowRight className="size-4" />
															Open
														</Link>
													</Button>
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

						{!projectsLoading && filteredProjects.length === 0 ? (
							<div className="rounded-[16px] border bg-muted/40 px-4 py-3 text-sm font-semibold text-muted-foreground">
								No projects match that search. Clear the search or create a new project.
							</div>
						) : null}
					</section>
				) : loading ? (
					<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
						{[0, 1, 2].map((item) => (
							<div key={item} className="min-h-[280px] animate-pulse rounded-[16px] bg-muted" />
						))}
					</section>
				) : (
					<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
						<Card className="md:col-span-2 xl:col-span-1">
							<CardHeader>
								<CardTitle>Create your first workspace</CardTitle>
								<CardDescription>
									A workspace is a GitHub repo. Once connected, this page becomes your project grid.
								</CardDescription>
							</CardHeader>
							<CardContent className="flex flex-wrap gap-2">
								{githubConnected ? (
									<Button asChild>
										<Link href="/app/workspace">
											<Plus className="size-4" />
											New workspace
										</Link>
									</Button>
								) : (
									<Button disabled={connectingGithub} onClick={handleConnectGithub}>
										{connectingGithub ? (
											<Loader2 className="size-4 animate-spin" />
										) : (
											<GitPullRequest className="size-4" />
										)}
										Connect GitHub
									</Button>
								)}
							</CardContent>
						</Card>
					</section>
				)}
			</div>
		</AppShell>
	);
}
