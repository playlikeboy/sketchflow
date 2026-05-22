"use client";

import Link from "next/link";
import { useStackApp, useUser } from "@stackframe/stack";
import { ArrowRight, Bot, Clock3, FileText, GitBranch, GitPullRequest, Globe, Loader2, Plus, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { bootstrapWorkspace, getGithubStatus, getWorkspaces, type GithubStatus, type Workspace } from "@/lib/api";

function shortSha(value: string | null) {
	return value ? value.slice(0, 7) : "pending";
}

export function DashboardClient() {
	const app = useStackApp();
	useUser({ or: "redirect" });
	const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
	const [githubStatus, setGithubStatus] = useState<GithubStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [repoName, setRepoName] = useState("sketchflow-workspace");
	const [isPrivate, setIsPrivate] = useState(true);
	const [bootstrapping, setBootstrapping] = useState(false);

	const latestWorkspace = useMemo(() => workspaces[0] ?? null, [workspaces]);

	async function refresh() {
		setLoading(true);
		setError(null);

		const [workspaceResult, githubResult] = await Promise.allSettled([getWorkspaces(), getGithubStatus()]);

		if (workspaceResult.status === "fulfilled") {
			setWorkspaces(workspaceResult.value.workspaces);
		} else {
			setError(workspaceResult.reason instanceof Error ? workspaceResult.reason.message : "Could not load workspaces");
		}

		if (githubResult.status === "fulfilled") {
			setGithubStatus(githubResult.value);
		} else {
			setGithubStatus(null);
		}

		setLoading(false);
	}

	useEffect(() => {
		void refresh();
	}, []);

	async function handleBootstrap() {
		setBootstrapping(true);
		setError(null);

		try {
			const response = await bootstrapWorkspace({ repoName, private: isPrivate });
			setWorkspaces((current) => [response.workspace, ...current.filter((workspace) => workspace.id !== response.workspace.id)]);
		} catch (bootstrapError) {
			setError(bootstrapError instanceof Error ? bootstrapError.message : "Could not create the workspace repo");
		} finally {
			setBootstrapping(false);
		}
	}

	return (
		<AppShell
			title="Workspace"
			subtitle={latestWorkspace ? `${latestWorkspace.repoOwner}/${latestWorkspace.repoName}` : "Create a GitHub-backed canvas workspace"}
			syncLabel={latestWorkspace ? `Synced ${shortSha(latestWorkspace.latestCommitSha)}` : undefined}
			action={
				<button
					type="button"
					onClick={() => void refresh()}
					className="grid size-9 place-items-center rounded-md border border-[#d6cec1] bg-white text-[#504a43] hover:bg-[#f0ece4]"
					aria-label="Refresh workspace data"
				>
					{loading ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <RefreshCw aria-hidden className="size-4" strokeWidth={1.8} />}
				</button>
			}
		>
			<div className="grid gap-5 xl:grid-cols-[1fr_360px]">
				<section className="space-y-5">
					<div className="grid gap-3 md:grid-cols-3">
						<div className="rounded-lg border border-[#d8d1c6] bg-[#fdfbf7] p-4">
							<div className="mb-2 flex items-center justify-between text-sm text-[#70675d]">
								<span>GitHub</span>
								<GitPullRequest aria-hidden className="size-4" strokeWidth={1.8} />
							</div>
							<div className="text-lg font-semibold">{githubStatus ? githubStatus.github.login : "Not connected"}</div>
						</div>
						<div className="rounded-lg border border-[#d8d1c6] bg-[#fdfbf7] p-4">
							<div className="mb-2 flex items-center justify-between text-sm text-[#70675d]">
								<span>Workspaces</span>
								<ShieldCheck aria-hidden className="size-4" strokeWidth={1.8} />
							</div>
							<div className="text-lg font-semibold">{workspaces.length}</div>
						</div>
						<div className="rounded-lg border border-[#d8d1c6] bg-[#fdfbf7] p-4">
							<div className="mb-2 flex items-center justify-between text-sm text-[#70675d]">
								<span>Latest commit</span>
								<GitBranch aria-hidden className="size-4" strokeWidth={1.8} />
							</div>
							<div className="text-lg font-semibold">{shortSha(latestWorkspace?.latestCommitSha ?? null)}</div>
						</div>
					</div>

					{error ? <div className="rounded-md border border-[#e9c6bd] bg-[#fff1ed] px-3 py-2 text-sm text-[#8a3324]">{error}</div> : null}

					<div className="rounded-lg border border-[#d8d1c6] bg-[#fdfbf7]">
						<div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4ded4] px-4 py-3">
							<div>
								<div className="font-semibold">Connected workspaces</div>
								<div className="text-sm text-[#70675d]">Each one maps to a repo that stores sketches, docs, exports, and metadata.</div>
							</div>
							{githubStatus ? null : (
								<button
									type="button"
									onClick={() => void app.redirectToAccountSettings()}
									className="inline-flex h-9 items-center gap-2 rounded-md border border-[#d6cec1] bg-white px-3 text-sm font-medium hover:bg-[#f0ece4]"
								>
									<GitPullRequest aria-hidden className="size-4" strokeWidth={1.9} />
									Connect GitHub
								</button>
							)}
						</div>

						{workspaces.length > 0 ? (
							<div className="divide-y divide-[#ebe5db]">
								{workspaces.map((workspace) => (
									<div key={workspace.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[1fr_auto]">
										<div>
											<div className="flex flex-wrap items-center gap-2">
												<div className="font-semibold">
													{workspace.repoOwner}/{workspace.repoName}
												</div>
												<span className="rounded-md border border-[#d8e0d8] bg-[#eef7f1] px-2 py-0.5 text-xs text-[#315a3f]">
													{workspace.visibility}
												</span>
											</div>
											<div className="mt-1 text-sm text-[#70675d]">
												{workspace.defaultBranch} · latest commit {shortSha(workspace.latestCommitSha)}
											</div>
										</div>
										<div className="flex flex-wrap items-center gap-2">
											<Link
												href={`https://github.com/${workspace.repoOwner}/${workspace.repoName}`}
												target="_blank"
												className="inline-flex h-9 items-center gap-2 rounded-md border border-[#d6cec1] bg-white px-3 text-sm font-medium hover:bg-[#f0ece4]"
											>
												<GitPullRequest aria-hidden className="size-4" strokeWidth={1.8} />
												Repo
											</Link>
											<Link
												href={`/app/workspaces/${workspace.id}/projects/first-project/sketches/system-map`}
												className="inline-flex h-9 items-center gap-2 rounded-md bg-[#1f2328] px-3 text-sm font-medium text-white hover:bg-[#34383f]"
											>
												<ArrowRight aria-hidden className="size-4" strokeWidth={1.9} />
												Open sketch
											</Link>
										</div>
									</div>
								))}
							</div>
						) : (
							<div className="grid gap-4 p-4 lg:grid-cols-[1fr_auto]">
								<div className="text-sm text-[#655d54]">
									No workspace repo is connected yet. Create one now and Sketchflow will initialize the `.sketchflow` manifest
									and project directory.
								</div>
								<div className="grid gap-2 sm:grid-cols-[220px_auto_auto]">
									<input
										value={repoName}
										onChange={(event) => setRepoName(event.target.value)}
										className="h-9 rounded-md border border-[#d6cec1] bg-white px-3 text-sm outline-none focus:border-[#315a3f] focus:ring-2 focus:ring-[#cbd8d0]"
										aria-label="Repository name"
									/>
									<label className="flex h-9 items-center gap-2 rounded-md border border-[#d6cec1] bg-white px-3 text-sm">
										<input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} />
										Private
									</label>
									<button
										type="button"
										disabled={!githubStatus || bootstrapping}
										onClick={handleBootstrap}
										className="inline-flex h-9 items-center gap-2 rounded-md bg-[#1f2328] px-3 text-sm font-medium text-white hover:bg-[#34383f] disabled:cursor-not-allowed disabled:bg-[#9d968c]"
									>
										{bootstrapping ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Plus aria-hidden className="size-4" strokeWidth={1.9} />}
										Create
									</button>
								</div>
							</div>
						)}
					</div>
				</section>

				<aside className="space-y-4">
					<div className="rounded-lg border border-[#d8d1c6] bg-[#fdfbf7] p-4">
						<div className="mb-3 flex items-center justify-between">
							<div className="font-semibold">Quick actions</div>
							<Sparkles aria-hidden className="size-4 text-[#315a3f]" strokeWidth={1.8} />
						</div>
						<div className="grid gap-2">
							{[
								{ label: "New sketch", icon: Plus, enabled: Boolean(latestWorkspace) },
								{ label: "Open docs", icon: FileText, enabled: false },
								{ label: "Publish page", icon: Globe, enabled: false },
								{ label: "Ask AI", icon: Bot, enabled: false },
								{ label: "Version timeline", icon: Clock3, enabled: false },
							].map((item) => (
								<button
									key={item.label}
									type="button"
									disabled={!item.enabled}
									className="flex h-10 items-center gap-3 rounded-md border border-[#ebe5db] bg-white px-3 text-left text-sm text-[#34302b] hover:bg-[#f0ece4] disabled:cursor-not-allowed disabled:text-[#9d968c]"
								>
									<item.icon aria-hidden className="size-4" strokeWidth={1.8} />
									{item.label}
								</button>
							))}
						</div>
					</div>

					<div className="rounded-lg border border-[#d8d1c6] bg-[#fdfbf7] p-4">
						<div className="font-semibold">Repo conventions</div>
						<div className="mt-3 space-y-2 font-mono text-xs text-[#655d54]">
							<div>projects/first-project/project.json</div>
							<div>projects/first-project/sketches/system-map.excalidraw.json</div>
							<div>projects/first-project/docs/notes.md</div>
						</div>
					</div>
				</aside>
			</div>
		</AppShell>
	);
}
