"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStackApp, useUser } from "@stackframe/stack";
import { ArrowRight, CheckCircle2, GitBranch, Loader2, LockKeyhole, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { bootstrapWorkspace, getGithubStatus, getWorkspaces, type GithubStatus, type Workspace } from "@/lib/api";

type LoadState = "idle" | "loading" | "ready" | "error";

export function HomeClient() {
	const app = useStackApp();
	const user = useUser();
	const router = useRouter();
	const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
	const [githubStatus, setGithubStatus] = useState<GithubStatus | null>(null);
	const [loadState, setLoadState] = useState<LoadState>("idle");
	const [error, setError] = useState<string | null>(null);
	const [repoName, setRepoName] = useState("sketchflow-workspace");
	const [isPrivate, setIsPrivate] = useState(true);
	const [bootstrapping, setBootstrapping] = useState(false);

	const primaryWorkspace = useMemo(() => workspaces[0] ?? null, [workspaces]);

	useEffect(() => {
		if (!user) {
			setLoadState("idle");
			setWorkspaces([]);
			setGithubStatus(null);
			return;
		}

		let mounted = true;
		setLoadState("loading");
		setError(null);

		Promise.allSettled([getWorkspaces(), getGithubStatus()]).then((results) => {
			if (!mounted) {
				return;
			}

			const workspaceResult = results[0];
			const githubResult = results[1];

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

			setLoadState(workspaceResult.status === "fulfilled" ? "ready" : "error");
		});

		return () => {
			mounted = false;
		};
	}, [user]);

	useEffect(() => {
		if (primaryWorkspace) {
			router.prefetch("/app");
		}
	}, [primaryWorkspace, router]);

	async function handleBootstrap() {
		setBootstrapping(true);
		setError(null);

		try {
			const response = await bootstrapWorkspace({ repoName, private: isPrivate });
			router.push(`/app/workspaces/${response.workspace.id}/projects/first-project/sketches/system-map`);
		} catch (bootstrapError) {
			setError(bootstrapError instanceof Error ? bootstrapError.message : "Could not create the workspace repo");
		} finally {
			setBootstrapping(false);
		}
	}

	if (!user) {
		return (
			<main className="min-h-screen bg-[#f7f5f0] text-[#1f2328]">
				<div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-5 sm:px-8">
					<header className="flex items-center justify-between border-b border-[#ded8cf] pb-4">
						<Link href="/" className="flex items-center gap-3">
							<div className="grid size-9 place-items-center rounded-lg bg-[#1f2328] text-sm font-semibold text-white">SF</div>
							<div>
								<div className="text-sm font-semibold">Sketchflow</div>
								<div className="text-xs text-[#70675d]">GitHub-native visual workspace</div>
							</div>
						</Link>
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={() => void app.redirectToSignIn()}
								className="h-9 rounded-md border border-[#d6cec1] bg-white px-3 text-sm font-medium text-[#34302b] hover:bg-[#f0ece4]"
							>
								Sign in
							</button>
							<button
								type="button"
								onClick={() => void app.redirectToSignUp()}
								className="inline-flex h-9 items-center gap-2 rounded-md bg-[#1f2328] px-3 text-sm font-medium text-white hover:bg-[#34383f]"
							>
								<ArrowRight aria-hidden className="size-4" strokeWidth={1.9} />
								Create workspace
							</button>
						</div>
					</header>

					<section className="grid flex-1 items-center gap-8 py-10 lg:grid-cols-[1fr_440px]">
						<div className="max-w-2xl">
							<div className="mb-5 inline-flex items-center gap-2 rounded-md border border-[#d8e0d8] bg-[#eef7f1] px-3 py-1 text-sm text-[#315a3f]">
								<ShieldCheck aria-hidden className="size-4" strokeWidth={1.8} />
								Your repo stays the source of truth
							</div>
							<h1 className="max-w-2xl text-4xl font-semibold leading-[1.05] tracking-normal text-[#171717] sm:text-6xl">
								Sketch, document, and sync every project artifact to GitHub.
							</h1>
							<p className="mt-5 max-w-xl text-base leading-7 text-[#5f574f]">
								Sketchflow starts with an Excalidraw editor and grows into a Git-native workspace for diagrams, docs,
								exports, public project pages, AI memory, and collaboration.
							</p>
							<div className="mt-7 flex flex-wrap gap-3">
								<button
									type="button"
									onClick={() => void app.redirectToSignUp()}
									className="inline-flex h-11 items-center gap-2 rounded-md bg-[#1f2328] px-4 text-sm font-semibold text-white hover:bg-[#34383f]"
								>
									<Plus aria-hidden className="size-4" strokeWidth={1.9} />
									Start with GitHub
								</button>
								<button
									type="button"
									onClick={() => void app.redirectToSignIn()}
									className="inline-flex h-11 items-center gap-2 rounded-md border border-[#d6cec1] bg-white px-4 text-sm font-semibold text-[#34302b] hover:bg-[#f0ece4]"
								>
									<LockKeyhole aria-hidden className="size-4" strokeWidth={1.9} />
									Open workspace
								</button>
							</div>
						</div>

						<div className="rounded-lg border border-[#d8d1c6] bg-[#fdfbf7] p-4 shadow-sm">
							<div className="flex items-center justify-between border-b border-[#e4ded4] pb-3">
								<div>
									<div className="text-sm font-semibold">Git-backed workspace</div>
									<div className="text-xs text-[#70675d]">MVP save/load path</div>
								</div>
								<GitBranch aria-hidden className="size-5 text-[#315a3f]" strokeWidth={1.8} />
							</div>
							<div className="mt-4 space-y-3 text-sm">
								{["IndexedDB draft autosave", "Manual GitHub commit sync", "Repo-owned sketches, docs, assets", "AI, exports, sharing, collab next"].map((item) => (
									<div key={item} className="flex items-center gap-3 rounded-md border border-[#ebe5db] bg-white px-3 py-2">
										<CheckCircle2 aria-hidden className="size-4 text-[#40724e]" strokeWidth={1.9} />
										<span>{item}</span>
									</div>
								))}
							</div>
						</div>
					</section>
				</div>
			</main>
		);
	}

	return (
		<main className="min-h-screen bg-[#f7f5f0] px-4 py-5 text-[#1f2328] sm:px-6">
			<div className="mx-auto max-w-5xl">
				<header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-[#ded8cf] pb-4">
					<Link href="/" className="flex items-center gap-3">
						<div className="grid size-9 place-items-center rounded-lg bg-[#1f2328] text-sm font-semibold text-white">SF</div>
						<div>
							<div className="text-sm font-semibold">Sketchflow</div>
							<div className="text-xs text-[#70675d]">{user.displayName || user.primaryEmail || "Signed in"}</div>
						</div>
					</Link>
					<Link
						href="/app"
						className="inline-flex h-9 items-center gap-2 rounded-md bg-[#1f2328] px-3 text-sm font-medium text-white hover:bg-[#34383f]"
					>
						<ArrowRight aria-hidden className="size-4" strokeWidth={1.9} />
						Open app
					</Link>
				</header>

				<section className="grid gap-4 lg:grid-cols-[1fr_380px]">
					<div className="rounded-lg border border-[#d8d1c6] bg-[#fdfbf7] p-5">
						<div className="mb-5 flex items-start justify-between gap-3">
							<div>
								<h1 className="text-2xl font-semibold">Create or connect your Sketchflow repo</h1>
								<p className="mt-1 text-sm text-[#655d54]">Sketches and docs will live in GitHub. Postgres keeps only app metadata.</p>
							</div>
							{loadState === "loading" ? <Loader2 aria-hidden className="size-5 animate-spin text-[#70675d]" /> : null}
						</div>

						{primaryWorkspace ? (
							<div className="rounded-md border border-[#cbd8d0] bg-[#eef7f1] p-4 text-sm text-[#315a3f]">
								<div className="font-semibold">Workspace already connected</div>
								<div className="mt-1">
									{primaryWorkspace.repoOwner}/{primaryWorkspace.repoName}
								</div>
								<Link
									href="/app"
									className="mt-4 inline-flex h-9 items-center gap-2 rounded-md bg-[#315a3f] px-3 text-sm font-medium text-white hover:bg-[#244531]"
								>
									<ArrowRight aria-hidden className="size-4" strokeWidth={1.9} />
									Go to dashboard
								</Link>
							</div>
						) : (
							<div className="space-y-4">
								<div className="rounded-md border border-[#e4ded4] bg-white p-4">
									<div className="mb-3 flex items-center gap-2 text-sm font-medium">
										<GitBranch aria-hidden className="size-4" strokeWidth={1.9} />
										GitHub connection
									</div>
									{githubStatus ? (
										<div className="text-sm text-[#315a3f]">Connected as {githubStatus.github.login}</div>
									) : (
										<div className="space-y-3 text-sm text-[#655d54]">
											<p>Connect GitHub in account settings, then come back and create the repo.</p>
											<button
												type="button"
												onClick={() => void app.redirectToAccountSettings()}
												className="inline-flex h-9 items-center gap-2 rounded-md border border-[#d6cec1] bg-[#fdfbf7] px-3 text-sm font-medium text-[#34302b] hover:bg-[#f0ece4]"
											>
												<GitBranch aria-hidden className="size-4" strokeWidth={1.9} />
												Connect GitHub
											</button>
										</div>
									)}
								</div>

								<div className="grid gap-3 sm:grid-cols-[1fr_auto]">
									<label className="block">
										<span className="mb-1 block text-xs font-medium uppercase text-[#7a7167]">Repository name</span>
										<input
											value={repoName}
											onChange={(event) => setRepoName(event.target.value)}
											className="h-10 w-full rounded-md border border-[#d6cec1] bg-white px-3 text-sm outline-none focus:border-[#315a3f] focus:ring-2 focus:ring-[#cbd8d0]"
										/>
									</label>
									<label className="flex h-10 items-center gap-2 self-end rounded-md border border-[#d6cec1] bg-white px-3 text-sm">
										<input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} />
										Private
									</label>
								</div>

								<button
									type="button"
									disabled={!githubStatus || bootstrapping}
									onClick={handleBootstrap}
									className="inline-flex h-10 items-center gap-2 rounded-md bg-[#1f2328] px-4 text-sm font-semibold text-white hover:bg-[#34383f] disabled:cursor-not-allowed disabled:bg-[#9d968c]"
								>
									{bootstrapping ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Plus aria-hidden className="size-4" strokeWidth={1.9} />}
									Create/connect repo
								</button>
							</div>
						)}

						{error ? <div className="mt-4 rounded-md border border-[#e9c6bd] bg-[#fff1ed] px-3 py-2 text-sm text-[#8a3324]">{error}</div> : null}
					</div>

					<aside className="space-y-3 rounded-lg border border-[#d8d1c6] bg-[#fdfbf7] p-5 text-sm">
						<div className="flex items-center justify-between">
							<div className="font-semibold">Backend status</div>
							<button
								type="button"
								onClick={() => router.refresh()}
								className="grid size-8 place-items-center rounded-md border border-[#d6cec1] bg-white hover:bg-[#f0ece4]"
								aria-label="Refresh status"
							>
								<RefreshCw aria-hidden className="size-4" strokeWidth={1.8} />
							</button>
						</div>
						<div className="rounded-md border border-[#ebe5db] bg-white px-3 py-2">
							<div className="text-xs text-[#70675d]">Auth</div>
							<div>Stack Auth session active</div>
						</div>
						<div className="rounded-md border border-[#ebe5db] bg-white px-3 py-2">
							<div className="text-xs text-[#70675d]">GitHub</div>
							<div>{githubStatus ? `Connected as ${githubStatus.github.login}` : "Connection needed"}</div>
						</div>
						<div className="rounded-md border border-[#ebe5db] bg-white px-3 py-2">
							<div className="text-xs text-[#70675d]">Workspaces</div>
							<div>{workspaces.length} connected</div>
						</div>
					</aside>
				</section>
			</div>
		</main>
	);
}
