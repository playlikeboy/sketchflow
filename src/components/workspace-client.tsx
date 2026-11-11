"use client";

import Link from "next/link";
import { useStackApp } from "@stackframe/stack";
import { ArrowRight, FolderOpen, Loader2, Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { GithubAccessCard } from "@/components/github-access-card";
import { EmptyPanel, Notice, ProjectListSkeleton } from "@/components/project-list";
import { StateMark } from "@/components/state-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkspaceAdvancedOptions } from "@/components/workspace-advanced-options";
import { bootstrapWorkspace } from "@/lib/api";
import { repoHref } from "@/lib/workspace-routes";
import {
	useAuthMe,
	useGithubStatus,
	useWorkspaces,
} from "@/lib/swr-hooks";

function shortSha(value: string | null) {
	return value ? value.slice(0, 7) : "pending";
}

function friendlyError(message: string) {
	if (message.toLowerCase().includes("github")) {
		return "GitHub access needs a refresh.";
	}

	return message;
}

export function WorkspaceClient() {
	const app = useStackApp();
	const appRef = useRef(app);
	const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [repoName, setRepoName] = useState("sketchflow-workspace");
	const [isPrivate, setIsPrivate] = useState(false);
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const [bootstrapping, setBootstrapping] = useState(false);
	const [localError, setLocalError] = useState<string | null>(null);
	const { data: auth, isLoading: authLoading } = useAuthMe();
	const {
		data: workspacesData,
		isLoading: workspacesLoading,
		mutate: mutateWorkspaces,
	} = useWorkspaces(auth?.user?.id);
	const {
		data: githubStatus,
		isLoading: githubLoading,
		mutate: mutateGithubStatus,
	} = useGithubStatus(auth?.user?.id);
	const workspaces = useMemo(() => workspacesData?.workspaces ?? [], [workspacesData]);
	const selectedWorkspace = useMemo(
		() => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? workspaces[0] ?? null,
		[selectedWorkspaceId, workspaces],
	);
	const filteredWorkspaces = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) return workspaces;

		return workspaces.filter((workspace) =>
			`${workspace.repoOwner}/${workspace.repoName} ${workspace.defaultBranch} ${workspace.visibility}`
				.toLowerCase()
				.includes(query),
		);
	}, [search, workspaces]);
	const githubConnected = githubStatus?.connected === true;
	const loading = authLoading || workspacesLoading || githubLoading;

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
		setLocalError(null);
		await Promise.all([mutateWorkspaces(), mutateGithubStatus()]);
	}

	async function handleCreateWorkspace() {
		setBootstrapping(true);
		setLocalError(null);

		try {
			const response = await bootstrapWorkspace({ repoName, private: isPrivate });
			await mutateWorkspaces();
			setSelectedWorkspaceId(response.workspace.id);
			setRepoName("sketchflow-workspace");
		} catch (error) {
			setLocalError(error instanceof Error ? friendlyError(error.message) : "Workspace creation did not finish");
		} finally {
			setBootstrapping(false);
		}
	}

	return (
		<AppShell
			title="Workspaces"
			subtitle={selectedWorkspace ? `${selectedWorkspace.repoOwner}/${selectedWorkspace.repoName}` : undefined}
			workspaces={workspaces}
			selectedWorkspaceId={selectedWorkspace?.id ?? null}
			onWorkspaceChange={setSelectedWorkspaceId}
			githubUnreachable={githubStatus?.connected === false}
			searchValue={search}
			onSearchChange={workspaces.length > 4 ? setSearch : undefined}
			searchPlaceholder="Search workspaces"
			action={
				<Button variant="ghost" size="icon-sm" onClick={() => void refresh()} aria-label="Refresh workspaces" title="Refresh">
					{loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
				</Button>
			}
		>
			<div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
				<section aria-labelledby="new-workspace-heading" className="rounded-lg border border-rule bg-card p-4">
					<h2 id="new-workspace-heading" className="text-base font-bold">Add a workspace</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						A workspace is one GitHub repository. Sketchflow creates it if the name is new, or connects it if you
						already own it, and never overwrites files that are already there.
					</p>

					<div className="mt-4 space-y-4">
						{localError && !localError.toLowerCase().includes("github") ? <Notice>{localError}</Notice> : null}

						{githubConnected ? (
							<StateMark state="synced" label={`GitHub connected as ${githubStatus?.connected ? githubStatus.github.login : ""}`} />
						) : githubLoading ? (
							<div className="h-5 w-44 animate-pulse rounded-sm bg-muted" aria-label="Checking GitHub connection" />
						) : (
							<GithubAccessCard
								compact
								scopes={githubStatus?.scopes}
								onRecovered={async () => {
									await refresh();
								}}
							/>
						)}

						<form
							className="space-y-3"
							onSubmit={(event) => {
								event.preventDefault();
								void handleCreateWorkspace();
							}}
						>
							<div>
								<label htmlFor="workspace-repo-name" className="legend-label mb-1 block">Repository name</label>
								<Input
									id="workspace-repo-name"
									value={repoName}
									onChange={(event) => setRepoName(event.target.value)}
									placeholder="sketchflow-workspace"
									autoComplete="off"
									spellCheck={false}
									className="datum"
								/>
								<p className="mt-1 text-xs text-muted-foreground">
									{isPrivate ? "Private" : "Public"} repository. Letters, numbers, dots, dashes and underscores.
								</p>
							</div>
							<WorkspaceAdvancedOptions
								open={advancedOpen}
								onOpenChange={setAdvancedOpen}
								isPrivate={isPrivate}
								onPrivateChange={setIsPrivate}
							/>
							<Button type="submit" disabled={!githubConnected || bootstrapping || !repoName.trim()} className="w-full">
								{bootstrapping ? <Loader2 className="animate-spin" /> : <Plus />}
								{bootstrapping ? "Setting up repository" : "Add workspace"}
							</Button>
						</form>
					</div>
				</section>

				<section aria-labelledby="workspaces-heading" className="space-y-3">
					<h2 id="workspaces-heading" className="text-sm font-bold">
						{workspaces.length} connected {workspaces.length === 1 ? "workspace" : "workspaces"}
					</h2>
					{workspacesLoading && workspaces.length === 0 ? (
						<ProjectListSkeleton rows={2} />
					) : filteredWorkspaces.length > 0 ? (
						<ul className="overflow-hidden rounded-lg border border-rule bg-card">
							{filteredWorkspaces.map((workspace) => (
								<li
									key={workspace.id}
									className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-3 py-3 last:border-b-0"
								>
									<div className="min-w-0">
										<div className="datum truncate font-semibold text-foreground">
											{workspace.repoOwner}/{workspace.repoName}
										</div>
										<div className="mt-0.5 text-xs text-muted-foreground">
											{workspace.visibility === "public" ? "Public" : "Private"} · branch{" "}
											<span className="datum">{workspace.defaultBranch}</span> · last commit{" "}
											<span className="datum">{shortSha(workspace.latestCommitSha)}</span>
										</div>
									</div>
									<div className="flex flex-wrap items-center gap-2">
										<Button variant="ghost" size="sm" asChild>
											<Link href={repoHref(workspace)} target="_blank" rel="noopener noreferrer">
												<FolderOpen />
												GitHub
											</Link>
										</Button>
										<Button variant="outline" size="sm" asChild>
											<Link href={`/app?workspace=${workspace.id}`}>
												Open projects
												<ArrowRight />
											</Link>
										</Button>
									</div>
								</li>
							))}
						</ul>
					) : workspaces.length > 0 ? (
						<EmptyPanel
							title="No workspaces match that search"
							action={
								<Button variant="outline" size="sm" onClick={() => setSearch("")}>
									Clear search
								</Button>
							}
						>
							Search looks at the repository owner, name, branch and visibility.
						</EmptyPanel>
					) : (
						<EmptyPanel title="No workspaces yet">
							Add one on the left. You will be able to open the repository on GitHub at any time and see exactly
							what Sketchflow wrote.
						</EmptyPanel>
					)}
				</section>
			</div>
		</AppShell>
	);
}
