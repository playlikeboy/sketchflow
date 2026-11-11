"use client";

import { useProjectHistory } from "@/lib/swr-hooks";
import { Button } from "@/components/ui/button";
import { Check, ExternalLink, Link2, Loader2, X } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

function formatDate(value: string) {
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? "Unknown date"
		: date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function HistoryPanel({
	workspaceId,
	projectId,
	userId,
	selectedPreviewSha,
	onPreviewShaChange,
	onRestore,
	restoringSha,
	workspace,
	onClose,
}: {
	workspaceId: string;
	projectId: string;
	userId: string | undefined;
	selectedPreviewSha: string | null;
	onPreviewShaChange: (sha: string | null) => void;
	onRestore: (sha: string) => void;
	restoringSha: string | null;
	workspace?: { repoOwner: string; repoName: string; visibility: string } | null;
	onClose?: () => void;
}) {
	const { data, isLoading, error } = useProjectHistory(workspaceId, projectId, userId);
	const [copiedSha, setCopiedSha] = useState<string | null>(null);

	const commits = data?.commits ?? [];

	function copyShareLink(sha: string) {
		if (!workspace) return;
		const shareUrl = `${window.location.origin}/share/${workspace.repoOwner}/${workspace.repoName}/${projectId}?ref=${sha}`;
		void navigator.clipboard.writeText(shareUrl).then(() => {
			setCopiedSha(sha);
			window.setTimeout(() => setCopiedSha((current) => (current === sha ? null : current)), 2000);
		});
	}

	return (
		<div className="flex h-full min-h-0 flex-col border-l border-border bg-card">
			<div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
				<div className="flex min-w-0 items-baseline gap-2">
					<h2 className="text-sm font-bold text-foreground">History</h2>
					<span className="datum truncate text-muted-foreground">projects/{projectId}</span>
				</div>
				{onClose ? (
					<Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close history">
						<X />
					</Button>
				) : null}
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto p-3">
				{isLoading ? (
					<div className="space-y-3" aria-busy="true" aria-label="Loading history">
						{[0, 1, 2].map((item) => (
							<div key={item} className="space-y-1.5 pl-6">
								<div className="h-3.5 w-3/4 animate-pulse rounded-sm bg-accent" />
								<div className="h-3 w-1/2 animate-pulse rounded-sm bg-muted" />
							</div>
						))}
					</div>
				) : error ? (
					<p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
						{error instanceof Error ? error.message : "History could not be loaded."} Close and reopen this panel to
						try again.
					</p>
				) : commits.length === 0 ? (
					<div className="rounded-md border border-dashed border-input px-3 py-5 text-sm text-muted-foreground">
						<p className="font-semibold text-foreground">No saved versions yet</p>
						<p className="mt-1">Each time you press Save, the commit appears here. You can preview or restore any of them.</p>
					</div>
				) : (
					/* The revision ladder: one tick per commit on a scale rule, newest at the top. */
					<ol className="scale-rule relative ml-1.5 bg-[position:0_0]">
						{commits.map((commit, index) => {
							const isSelected = selectedPreviewSha === commit.sha;
							return (
								<li key={commit.sha} className="relative pb-4 pl-5 last:pb-1">
									<span
										aria-hidden="true"
										className={cn(
											"absolute top-1.5 -left-[5px] size-[11px] rounded-full border-2 border-card",
											isSelected ? "bg-grid" : index === 0 ? "bg-wood" : "bg-muted-foreground/60",
										)}
									/>
									<div
										className={cn(
											"rounded-md border px-2.5 py-2",
											isSelected ? "border-grid/60 bg-grid-tint" : "border-transparent hover:border-rule hover:bg-muted/60",
										)}
									>
										<p className="line-clamp-2 text-sm font-medium text-foreground">{commit.message}</p>
										<p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
											<span className="datum">{commit.sha.slice(0, 7)}</span>
											<span>{formatDate(commit.authorDate)}</span>
											<span>{commit.authorName}</span>
											{index === 0 ? <span className="font-medium text-wood">Latest</span> : null}
										</p>
										<div className="mt-2 flex flex-wrap items-center gap-1.5">
											<Button
												variant={isSelected ? "default" : "outline"}
												size="xs"
												aria-pressed={isSelected}
												onClick={() => onPreviewShaChange(isSelected ? null : commit.sha)}
												disabled={restoringSha !== null}
											>
												{isSelected ? "Stop previewing" : "Preview"}
											</Button>
											{index === 0 ? null : (
												<Button
													variant="outline"
													size="xs"
													onClick={() => onRestore(commit.sha)}
													disabled={restoringSha !== null}
													title="Copy this version into a new commit. Nothing is deleted."
												>
													{restoringSha === commit.sha ? <Loader2 className="animate-spin" /> : null}
													{restoringSha === commit.sha ? "Restoring" : "Restore"}
												</Button>
											)}
											{commit.htmlUrl ? (
												<Button variant="ghost" size="icon-xs" asChild>
													<a href={commit.htmlUrl} target="_blank" rel="noopener noreferrer" aria-label="View this commit on GitHub" title="View on GitHub">
														<ExternalLink />
													</a>
												</Button>
											) : null}
											{workspace?.visibility === "public" ? (
												<Button
													variant="ghost"
													size="xs"
													onClick={() => copyShareLink(commit.sha)}
													title="Copy a share link pinned to this version"
												>
													{copiedSha === commit.sha ? <Check /> : <Link2 />}
													<span aria-live="polite">{copiedSha === commit.sha ? "Copied" : "Copy link"}</span>
												</Button>
											) : null}
										</div>
									</div>
								</li>
							);
						})}
					</ol>
				)}
			</div>
		</div>
	);
}
