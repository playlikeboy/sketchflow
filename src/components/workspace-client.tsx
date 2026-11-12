"use client";

import Link from "next/link";
import { ArrowRight, FolderOpen, GitBranch, Loader2, Plus, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { GithubProblemNotice } from "@/components/github-problem-notice";
import { LocalSyncPanel } from "@/components/local-sync-panel";
import { EmptyPanel, Notice, ProjectListSkeleton } from "@/components/project-list";
import { StateMark } from "@/components/state-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkspaceAdvancedOptions } from "@/components/workspace-advanced-options";
import { bootstrapWorkspace, type Workspace } from "@/lib/api";
import { signInWithGithub } from "@/lib/auth-client";
import {
	githubProblemFromError,
	githubProblemFromStatus,
	needsGithubReconnect,
	nonGithubErrorMessage,
	pickGithubProblem,
	type GithubProblem,
} from "@/lib/github-errors";
import { LOCAL_WORKSPACE, isLocalWorkspace, workspaceLabel } from "@/lib/local-workspace";
import { repoHref } from "@/lib/workspace-routes";
import { useGithubStatus } from "@/lib/swr-hooks";
import { useAppWorkspaces } from "@/lib/swr-offline";
import { useAppIdentity } from "@/lib/use-app-identity";

const DEFAULT_REPO_NAME = "sketchflow-workspace";

function shortSha(value: string | null) {
	return value ? value.slice(0, 7) : "pending";
}

function projectCountLabel(count: number) {
	return `${count} ${count === 1 ? "project" : "projects"}`;
}

/** The guest workspace as a list row: how many projects it holds and a way in. */
function DeviceWorkspaceRow({ projectCount }: { projectCount: number }) {
	return (
		<li className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-3 py-3 last:border-b-0">
			<div className="min-w-0">
				<div className="truncate font-semibold text-foreground">{workspaceLabel(LOCAL_WORKSPACE)}</div>
				<div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
					<StateMark state="local" label="In this browser" />
					<span>· {projectCountLabel(projectCount)}</span>
				</div>
			</div>
			<Button variant="outline" size="sm" asChild>
				<Link href={`/app?workspace=${LOCAL_WORKSPACE.id}`}>
					Open projects
					<ArrowRight />
				</Link>
			</Button>
		</li>
	);
}

function RepositoryWorkspaceRow({ workspace }: { workspace: Workspace }) {
	return (
		<li className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-3 py-3 last:border-b-0">
			<div className="min-w-0">
				<div className="datum truncate font-semibold text-foreground">{workspaceLabel(workspace)}</div>
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
	);
}

/** Signed out: the device workspace, and one way to add GitHub. */
function GuestWorkspaces({ projectCount }: { projectCount: number }) {
	const [connecting, setConnecting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function connect() {
		setConnecting(true);
		setError(null);
		try {
			await signInWithGithub("/app/workspace");
		} catch (connectError) {
			setError(connectError instanceof Error ? connectError.message : "GitHub sign-in did not start. Try again.");
			setConnecting(false);
		}
	}

	return (
		<div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
			<section aria-labelledby="connect-github-heading" className="rounded-lg border border-rule bg-card p-4">
				<h2 id="connect-github-heading" className="text-base font-bold">Connect GitHub</h2>
				<p className="mt-1 text-sm text-muted-foreground">Back up your projects to a repository you own.</p>
				{error ? <div className="mt-3"><Notice>{error}</Notice></div> : null}
				<Button className="mt-4 w-full" onClick={() => void connect()} disabled={connecting}>
					{connecting ? <Loader2 className="animate-spin" /> : <GitBranch />}
					Connect GitHub
				</Button>
			</section>

			<section aria-labelledby="workspaces-heading" className="space-y-3">
				<h2 id="workspaces-heading" className="text-sm font-bold">1 workspace</h2>
				<ul className="overflow-hidden rounded-lg border border-rule bg-card">
					<DeviceWorkspaceRow projectCount={projectCount} />
				</ul>
			</section>
		</div>
	);
}

function AddWorkspaceForm({
	githubConnected,
	githubLoading,
	githubLogin,
	githubProblem,
	canCreate,
	error,
	bootstrapping,
	onRecovered,
	onCreate,
}: {
	githubConnected: boolean;
	githubLoading: boolean;
	githubLogin: string;
	/** What is wrong with GitHub, if anything. Only a rejected sign-in asks to reconnect. */
	githubProblem: GithubProblem | null;
	canCreate: boolean;
	error: string | null;
	bootstrapping: boolean;
	onRecovered: () => Promise<void>;
	onCreate: (input: { repoName: string; isPrivate: boolean }) => Promise<boolean>;
}) {
	const [repoName, setRepoName] = useState(DEFAULT_REPO_NAME);
	const [isPrivate, setIsPrivate] = useState(false);
	const [advancedOpen, setAdvancedOpen] = useState(false);

	return (
		<section aria-labelledby="new-workspace-heading" className="rounded-lg border border-rule bg-card p-4">
			<h2 id="new-workspace-heading" className="text-base font-bold">Add a workspace</h2>
			<p className="mt-1 text-sm text-muted-foreground">
				A workspace is one GitHub repository. Sketchflow creates it if the name is new, or connects it if you
				already own it, and never overwrites files that are already there.
			</p>

			<div className="mt-4 space-y-4">
				{error ? <Notice>{error}</Notice> : null}

				{githubProblem ? (
					<GithubProblemNotice compact {...githubProblem} onRetry={onRecovered} />
				) : githubConnected ? (
					<StateMark state="synced" label={`GitHub connected as ${githubLogin}`} />
				) : githubLoading ? (
					<div className="h-5 w-44 animate-pulse rounded-sm bg-muted" aria-label="Checking GitHub connection" />
				) : null}

				<form
					className="space-y-3"
					onSubmit={(event) => {
						event.preventDefault();
						void onCreate({ repoName, isPrivate }).then((created) => {
							if (created) setRepoName(DEFAULT_REPO_NAME);
						});
					}}
				>
					<div>
						<label htmlFor="workspace-repo-name" className="legend-label mb-1 block">Repository name</label>
						<Input
							id="workspace-repo-name"
							value={repoName}
							onChange={(event) => setRepoName(event.target.value)}
							placeholder={DEFAULT_REPO_NAME}
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
					<Button type="submit" disabled={!canCreate || bootstrapping || !repoName.trim()} className="w-full">
						{bootstrapping ? <Loader2 className="animate-spin" /> : <Plus />}
						{bootstrapping ? "Setting up repository" : "Add workspace"}
					</Button>
				</form>
			</div>
		</section>
	);
}

function WorkspaceRows({
	loading,
	repoWorkspaces,
	filteredWorkspaces,
	guestProjectCount,
	searching,
	onClearSearch,
}: {
	loading: boolean;
	repoWorkspaces: Workspace[];
	filteredWorkspaces: Workspace[];
	guestProjectCount: number;
	searching: boolean;
	onClearSearch: () => void;
}) {
	const showDevice = guestProjectCount > 0 && !searching;

	if (loading && repoWorkspaces.length === 0) return <ProjectListSkeleton rows={2} />;

	if (filteredWorkspaces.length > 0 || showDevice) {
		return (
			<ul className="overflow-hidden rounded-lg border border-rule bg-card">
				{filteredWorkspaces.map((workspace) => (
					<RepositoryWorkspaceRow key={workspace.id} workspace={workspace} />
				))}
				{showDevice ? <DeviceWorkspaceRow projectCount={guestProjectCount} /> : null}
			</ul>
		);
	}

	if (repoWorkspaces.length > 0) {
		return (
			<EmptyPanel
				title="No workspaces match that search"
				action={
					<Button variant="outline" size="sm" onClick={onClearSearch}>
						Clear search
					</Button>
				}
			>
				Search looks at the repository owner, name, branch and visibility.
			</EmptyPanel>
		);
	}

	return (
		<EmptyPanel title="No workspaces yet">
			Add one on the left. You will be able to open the repository on GitHub at any time and see exactly
			what Sketchflow wrote.
		</EmptyPanel>
	);
}

export function WorkspaceClient() {
	const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [bootstrapping, setBootstrapping] = useState(false);
	const [localError, setLocalError] = useState<string | null>(null);
	// A GitHub problem raised while adding a workspace, as opposed to one the status check found.
	const [actionProblem, setActionProblem] = useState<GithubProblem | null>(null);
	const { isSignedIn, isLoading: identityLoading, userId } = useAppIdentity();
	const {
		workspaces,
		selectedWorkspace,
		isLoading: workspacesLoading,
		guestProjectCount,
		refresh: refreshWorkspaces,
	} = useAppWorkspaces(userId, selectedWorkspaceId);
	const {
		data: githubStatus,
		error: githubStatusError,
		isLoading: githubLoading,
		mutate: mutateGithubStatus,
	} = useGithubStatus(isSignedIn ? userId : null);

	const repoWorkspaces = useMemo(() => workspaces.filter((workspace) => !isLocalWorkspace(workspace.id)), [workspaces]);
	// The repository that guest projects would be copied into: the selected one, else the first.
	const syncTarget =
		selectedWorkspace && !isLocalWorkspace(selectedWorkspace.id) ? selectedWorkspace : (repoWorkspaces[0] ?? null);
	const filteredWorkspaces = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) return repoWorkspaces;

		return repoWorkspaces.filter((workspace) =>
			`${workspaceLabel(workspace)} ${workspace.defaultBranch} ${workspace.visibility}`.toLowerCase().includes(query),
		);
	}, [search, repoWorkspaces]);
	const githubConnected = githubStatus?.connected === true;
	const statusProblem = pickGithubProblem([githubProblemFromStatus(githubStatus), githubProblemFromError(githubStatusError)]);
	const githubProblem = pickGithubProblem([statusProblem, actionProblem]);
	// A rate limit or a GitHub hiccup during the status check is no reason to lock the form:
	// only a sign-in that GitHub rejects makes adding a workspace pointless.
	const canCreate = githubConnected || Boolean(statusProblem && !needsGithubReconnect(statusProblem.code));
	const formError = localError || nonGithubErrorMessage(githubStatusError);
	const loading = identityLoading || workspacesLoading || (isSignedIn && githubLoading);

	async function refresh() {
		setLocalError(null);
		setActionProblem(null);
		await Promise.all([refreshWorkspaces(), isSignedIn ? mutateGithubStatus() : undefined]);
	}

	async function handleCreateWorkspace(input: { repoName: string; isPrivate: boolean }) {
		setBootstrapping(true);
		setLocalError(null);
		setActionProblem(null);

		try {
			const response = await bootstrapWorkspace({ repoName: input.repoName, private: input.isPrivate });
			await refreshWorkspaces();
			setSelectedWorkspaceId(response.workspace.id);
			return true;
		} catch (error) {
			const problem = githubProblemFromError(error);
			setActionProblem(problem);
			if (!problem) {
				setLocalError(error instanceof Error ? error.message : "Workspace creation did not finish");
			}
			return false;
		} finally {
			setBootstrapping(false);
		}
	}

	let content;
	if (identityLoading) {
		content = <ProjectListSkeleton rows={2} />;
	} else if (!isSignedIn) {
		content = <GuestWorkspaces projectCount={guestProjectCount} />;
	} else {
		content = (
			<div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
				<AddWorkspaceForm
					githubConnected={githubConnected}
					githubLoading={githubLoading}
					githubLogin={githubStatus?.connected ? githubStatus.github.login : ""}
					githubProblem={githubProblem}
					canCreate={canCreate}
					error={formError}
					bootstrapping={bootstrapping}
					onRecovered={refresh}
					onCreate={handleCreateWorkspace}
				/>

				<section aria-labelledby="workspaces-heading" className="space-y-3">
					{syncTarget ? <LocalSyncPanel workspace={syncTarget} onSynced={refreshWorkspaces} /> : null}
					<h2 id="workspaces-heading" className="text-sm font-bold">
						{repoWorkspaces.length} connected {repoWorkspaces.length === 1 ? "workspace" : "workspaces"}
					</h2>
					<WorkspaceRows
						loading={workspacesLoading}
						repoWorkspaces={repoWorkspaces}
						filteredWorkspaces={filteredWorkspaces}
						guestProjectCount={guestProjectCount}
						searching={Boolean(search.trim())}
						onClearSearch={() => setSearch("")}
					/>
				</section>
			</div>
		);
	}

	return (
		<AppShell
			title="Workspaces"
			subtitle={selectedWorkspace ? workspaceLabel(selectedWorkspace) : undefined}
			workspaces={workspaces}
			selectedWorkspaceId={selectedWorkspace?.id ?? null}
			onWorkspaceChange={setSelectedWorkspaceId}
			githubUnreachable={isSignedIn && githubStatus?.connected === false}
			searchValue={search}
			onSearchChange={repoWorkspaces.length > 4 ? setSearch : undefined}
			searchPlaceholder="Search workspaces"
			action={
				<Button variant="ghost" size="icon-sm" onClick={() => void refresh()} aria-label="Refresh workspaces" title="Refresh">
					{loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
				</Button>
			}
		>
			{content}
		</AppShell>
	);
}
