"use client";

import Link from "next/link";
import { useStackApp } from "@stackframe/stack";
import {
	ArrowRight,
	FolderOpen,
	Loader2,
	Plus,
	RefreshCw,
	Settings,
	ShieldCheck,
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
import { WorkspaceAdvancedOptions } from "@/components/workspace-advanced-options";
import { bootstrapWorkspace } from "@/lib/api";
import { sketchHref, repoHref, repoFolderHref } from "@/lib/workspace-routes";
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
			title="Workspace"
			subtitle={selectedWorkspace ? `${selectedWorkspace.repoOwner}/${selectedWorkspace.repoName}` : "Create or connect a repo"}
			syncLabel={selectedWorkspace ? `Synced ${shortSha(selectedWorkspace.latestCommitSha)}` : undefined}
			workspaces={workspaces}
			selectedWorkspaceId={selectedWorkspace?.id ?? null}
			onWorkspaceChange={setSelectedWorkspaceId}
			searchValue={search}
			onSearchChange={setSearch}
			searchPlaceholder="Search workspaces"
			action={
				<Button variant="ghost" size="icon" onClick={() => void refresh()} aria-label="Refresh workspace">
					{loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
				</Button>
			}
		>
			<div className="mx-auto max-w-6xl">
				<section className="space-y-5">
					{localError ? (
						localError.toLowerCase().includes("github") ? (
							<GithubAccessCard
								scopes={githubStatus?.scopes}
								onRecovered={async () => {
									await refresh();
								}}
							/>
						) : (
							<div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
								{localError}
							</div>
						)
					) : null}

					<Card>
						<CardHeader>
							<CardTitle>Create workspace</CardTitle>
							<CardDescription>Create a repo-backed workspace.</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							{githubConnected ? (
								<div className="rounded-2xl border bg-muted/40 p-4">
									<div className="flex items-center gap-2 text-sm font-extrabold">
										<ShieldCheck className="size-4 text-primary" />
										GitHub connected
									</div>
								</div>
							) : (
								<GithubAccessCard
									scopes={githubStatus?.scopes}
									onRecovered={async () => {
										await refresh();
									}}
								/>
							)}

							<div className="grid gap-3 sm:grid-cols-[1fr_auto]">
								<Input
									value={repoName}
									onChange={(event) => setRepoName(event.target.value)}
									placeholder="sketchflow-workspace"
									aria-label="Repository name"
								/>
								<Badge variant="outline" className="h-10 rounded-xl px-3">
									Public by default
								</Badge>
							</div>
							<WorkspaceAdvancedOptions
								open={advancedOpen}
								onOpenChange={setAdvancedOpen}
								isPrivate={isPrivate}
								onPrivateChange={setIsPrivate}
							/>
							<Button disabled={!githubConnected || bootstrapping} onClick={handleCreateWorkspace}>
								{bootstrapping ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
								Create workspace
							</Button>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Connected workspaces</CardTitle>
							<CardDescription>Your repos connected to Sketchflow.</CardDescription>
						</CardHeader>
						<CardContent className="grid gap-3">
							{filteredWorkspaces.length > 0 ? (
								filteredWorkspaces.map((workspace) => (
									<div key={workspace.id} className="rounded-2xl border bg-card p-4">
										<div className="flex flex-wrap items-start justify-between gap-3">
											<div>
												<div className="text-sm font-extrabold">
													{workspace.repoOwner}/{workspace.repoName}
												</div>
												<div className="mt-1 text-xs font-semibold text-muted-foreground">
													{workspace.visibility} · {workspace.defaultBranch} · {shortSha(workspace.latestCommitSha)}
												</div>
											</div>
											<div className="flex flex-wrap gap-2">
												<Button variant="outline" size="sm" asChild>
													<Link href={repoHref(workspace)} target="_blank">
														<FolderOpen className="size-4" />
														Repo
													</Link>
												</Button>
												<Button variant="outline" size="sm" asChild>
													<Link href={repoFolderHref(workspace, "projects")} target="_blank">
														<Settings className="size-4" />
														Files
													</Link>
												</Button>
												<Button size="sm" asChild>
													<Link href={sketchHref(workspace.id)}>
														Open canvas
														<ArrowRight className="size-4" />
													</Link>
												</Button>
											</div>
										</div>
									</div>
								))
							) : (
								<div className="rounded-2xl border bg-muted/40 px-4 py-3 text-sm font-semibold text-muted-foreground">
									No workspaces match that search.
								</div>
							)}
						</CardContent>
					</Card>
				</section>
			</div>
		</AppShell>
	);
}
