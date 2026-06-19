"use client";

import { useProjectHistory } from "@/lib/swr-hooks";
import { Button } from "@/components/ui/button";
import { ExternalLink, GitBranch, Loader2, Clock, Share2 } from "lucide-react";
import { toast } from "sonner";

function formatDate(value: string) {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "Unknown Date" : date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
}: {
	workspaceId: string;
	projectId: string;
	userId: string | undefined;
	selectedPreviewSha: string | null;
	onPreviewShaChange: (sha: string | null) => void;
	onRestore: (sha: string) => void;
	restoringSha: string | null;
	workspace?: { repoOwner: string; repoName: string; visibility: string } | null;
}) {
	const { data, isLoading, error } = useProjectHistory(workspaceId, projectId, userId);

	const commits = data?.commits ?? [];

	return (
		<div className="flex h-full min-h-0 flex-col border-l bg-card">
			<div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
				<div className="flex min-w-0 items-center gap-2">
					<Clock className="size-4 text-[#CE82FF]" />
					<div className="min-w-0">
						<div className="truncate text-sm font-extrabold text-foreground">Project history</div>
						<div className="truncate text-xs font-semibold text-muted-foreground">
							projects/{projectId} commits
						</div>
					</div>
				</div>
			</div>

			<div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
				{isLoading ? (
					<div className="grid h-24 place-items-center">
						<Loader2 className="size-6 animate-spin text-primary" />
					</div>
				) : error ? (
					<div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs font-semibold text-destructive">
						{error instanceof Error ? error.message : "Failed to load project history."}
					</div>
				) : commits.length === 0 ? (
					<div className="rounded-xl border bg-muted/20 px-4 py-6 text-center text-xs font-semibold text-muted-foreground">
						No version history found. Save changes to commit.
					</div>
				) : (
					commits.map((commit) => {
						const isSelected = selectedPreviewSha === commit.sha;
						return (
							<div
								key={commit.sha}
								className={`flex flex-col gap-2 rounded-xl border p-3 transition-colors ${
									isSelected ? "border-[#CE82FF] bg-[#CE82FF]/5" : "bg-card hover:bg-muted/10"
								}`}
							>
								<div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
									<span>{commit.authorName}</span>
									<span>{formatDate(commit.authorDate)}</span>
								</div>
								<div className="line-clamp-2 text-xs font-bold leading-relaxed text-foreground">
									{commit.message}
								</div>
								<div className="mt-1 flex items-center justify-between">
									<span className="font-mono text-[10px] font-extrabold text-muted-foreground">
										{commit.sha.slice(0, 7)}
									</span>
									<div className="flex gap-1.5">
										<Button
											variant={isSelected ? "default" : "outline"}
											size="xs"
											className={isSelected ? "bg-[#CE82FF] hover:bg-[#CE82FF]/90 text-white shadow-[0_4px_0_#9E4FFF]" : ""}
											onClick={() => onPreviewShaChange(isSelected ? null : commit.sha)}
											disabled={restoringSha !== null}
										>
											{isSelected ? "Close Preview" : "Preview"}
										</Button>
										<Button
											variant="outline"
											size="xs"
											onClick={() => onRestore(commit.sha)}
											disabled={restoringSha !== null}
										>
											{restoringSha === commit.sha ? (
												<Loader2 className="size-3 animate-spin text-primary" />
											) : (
												"Restore"
											)}
										</Button>
										{commit.htmlUrl ? (
											<Button variant="ghost" size="icon-xs" asChild>
												<a
													href={commit.htmlUrl}
													target="_blank"
													rel="noopener noreferrer"
													aria-label="View commit on GitHub"
												>
													<ExternalLink className="size-3" />
												</a>
											</Button>
										) : null}
										{workspace?.visibility === "public" ? (
											<Button
												variant="ghost"
												size="icon-xs"
												title="Copy public share link"
												onClick={() => {
													const shareUrl = `${window.location.origin}/share/${workspace.repoOwner}/${workspace.repoName}/${projectId}?ref=${commit.sha}`;
													void navigator.clipboard.writeText(shareUrl).then(() => {
														toast.success("Share link copied!");
													});
												}}
											>
												<Share2 className="size-3" />
											</Button>
										) : null}
									</div>
								</div>
							</div>
						);
					})
				)}
			</div>
		</div>
	);
}
