"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, UploadCloud } from "lucide-react";

import { StateGlyph } from "@/components/state-mark";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Workspace } from "@/lib/api";
import { redirectToSignIn } from "@/lib/auth-client";
import { describeSyncError, needsSignIn, syncGuestProjects, type SyncProgress, type SyncResult } from "@/lib/local-sync";
import { listGuestProjects, workspaceLabel } from "@/lib/local-workspace";
import type { WorkspaceProject } from "@/lib/project-metadata";

export type LocalSyncPanelProps = {
	/** The repository workspace the guest projects will be copied into. */
	workspace: Workspace;
	/** Called after at least one project reached the repository, so lists can refresh. */
	onSynced?: () => Promise<void> | void;
};

type PanelError = { message: string; needsSignIn: boolean };

const editedFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function formatEdited(value: string) {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "Unknown" : editedFormat.format(date);
}

function headingFor(count: number) {
	return count === 1 ? "1 project on this device isn't backed up" : `${count} projects on this device aren't backed up`;
}

function progressText(progress: SyncProgress) {
	const step = Math.min(progress.completed + 1, progress.total);
	return progress.currentTitle
		? `Syncing ${step} of ${progress.total}: ${progress.currentTitle}`
		: `Syncing ${step} of ${progress.total}`;
}

function summaryText(results: readonly SyncResult[]) {
	const synced = results.filter((result) => result.status === "synced").length;
	const failed = results.length - synced;
	if (failed === 0) return `Synced ${synced} ${synced === 1 ? "project" : "projects"}.`;
	if (synced === 0) return `Nothing was synced. ${failed === 1 ? "The project is" : "The projects are"} still on this device.`;
	return `Synced ${synced}, ${failed} kept on this device.`;
}

/**
 * Offers to copy projects made on this device (the guest workspace) into a repository.
 * Renders nothing when there is nothing to sync. Implemented with src/lib/local-sync.ts.
 */
export function LocalSyncPanel({ workspace, onSynced }: LocalSyncPanelProps) {
	const [projects, setProjects] = useState<WorkspaceProject[] | null>(null);
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [progress, setProgress] = useState<SyncProgress | null>(null);
	const [results, setResults] = useState<SyncResult[] | null>(null);
	const [error, setError] = useState<PanelError | null>(null);
	const mountedRef = useRef(true);
	const target = workspaceLabel(workspace);
	const isSyncing = progress !== null;

	const loadProjects = useCallback(async () => {
		try {
			const guests = await listGuestProjects();
			if (!mountedRef.current) return;
			setProjects(guests);
			setSelectedIds(guests.map((project) => project.id));
		} catch (loadError) {
			if (!mountedRef.current) return;
			setProjects([]);
			setError({ message: `Couldn't read projects on this device. ${describeSyncError(loadError)}`, needsSignIn: false });
		}
	}, []);

	useEffect(() => {
		mountedRef.current = true;
		void loadProjects();
		return () => {
			mountedRef.current = false;
		};
	}, [loadProjects]);

	const toggleProject = (projectId: string, checked: boolean) => {
		setSelectedIds((current) =>
			checked ? [...current.filter((id) => id !== projectId), projectId] : current.filter((id) => id !== projectId),
		);
	};

	const handleSync = async () => {
		// Keep the list order, not the order the boxes were ticked in.
		const projectIds = (projects ?? []).map((project) => project.id).filter((id) => selectedIds.includes(id));
		if (projectIds.length === 0 || isSyncing) return;

		setError(null);
		setResults(null);
		setProgress({ completed: 0, total: projectIds.length, currentTitle: null });
		try {
			const runResults = await syncGuestProjects({
				workspace,
				projectIds,
				onProgress: (update) => mountedRef.current && setProgress(update),
			});
			if (!mountedRef.current) return;
			setResults(runResults);
			if (runResults.some((result) => result.status === "synced")) {
				await onSynced?.();
			}
		} catch (syncError) {
			if (!mountedRef.current) return;
			setError({ message: describeSyncError(syncError), needsSignIn: needsSignIn(syncError) });
		} finally {
			if (mountedRef.current) {
				setProgress(null);
				await loadProjects();
			}
		}
	};

	const hasProjects = (projects?.length ?? 0) > 0;
	if (projects === null || (!hasProjects && !results && !error)) {
		return null;
	}

	const showSignIn = error?.needsSignIn || (results ?? []).some((result) => result.needsSignIn);
	const liveText = progress ? progressText(progress) : results ? summaryText(results) : "";

	return (
		<section aria-labelledby="local-sync-heading" className="rounded-lg border border-rule bg-card text-sm">
			<header className="flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-rule px-3 py-3">
				<StateGlyph state="local" className="mt-1" />
				<div className="min-w-0 flex-1">
					<h2 id="local-sync-heading" className="font-semibold">
						{hasProjects ? headingFor(projects.length) : "Projects on this device"}
					</h2>
					{hasProjects ? (
						<p className="text-[0.8125rem] text-muted-foreground">
							They are saved in this browser only. Copy them to {target} to keep them.
						</p>
					) : null}
				</div>
			</header>

			{hasProjects ? (
				<ProjectChecklist
					projects={projects}
					selectedIds={selectedIds}
					disabled={isSyncing}
					onToggle={toggleProject}
				/>
			) : null}

			{results ? <SyncResults results={results} /> : null}

			<footer className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3">
				{hasProjects ? (
					<Button size="sm" onClick={() => void handleSync()} disabled={isSyncing || selectedIds.length === 0}>
						{isSyncing ? <Loader2 className="animate-spin" aria-hidden="true" /> : <UploadCloud aria-hidden="true" />}
						Sync to {target}
					</Button>
				) : (
					<Button size="sm" variant="outline" onClick={() => setResults(null)}>
						Done
					</Button>
				)}
				{showSignIn ? (
					<Button size="sm" variant="outline" onClick={() => redirectToSignIn()}>
						Sign in again
					</Button>
				) : null}
				<p role="status" aria-live="polite" className="min-w-0 flex-1 text-[0.8125rem] text-muted-foreground">
					{liveText}
				</p>
			</footer>

			{error ? (
				<p role="alert" className="border-t border-rule px-3 py-2 text-[0.8125rem] text-destructive">
					{error.message}
				</p>
			) : null}
		</section>
	);
}

type ProjectChecklistProps = {
	projects: WorkspaceProject[];
	selectedIds: readonly string[];
	disabled: boolean;
	onToggle: (projectId: string, checked: boolean) => void;
};

function ProjectChecklist({ projects, selectedIds, disabled, onToggle }: ProjectChecklistProps) {
	return (
		<fieldset disabled={disabled} className="border-b border-rule">
			<legend className="sr-only">Projects to sync</legend>
			<ul>
				{projects.map((project) => {
					const inputId = `local-sync-${project.id}`;
					return (
						<li key={project.id} className="flex items-center gap-3 border-b border-rule px-3 py-2 last:border-b-0">
							<Checkbox
								id={inputId}
								checked={selectedIds.includes(project.id)}
								disabled={disabled}
								onCheckedChange={(checked) => onToggle(project.id, checked === true)}
							/>
							<label htmlFor={inputId} className="min-w-0 flex-1 cursor-pointer truncate font-medium">
								{project.title}
							</label>
							<span className="shrink-0 text-xs text-muted-foreground">
								Edited <time dateTime={project.updatedAt}>{formatEdited(project.updatedAt)}</time>
							</span>
						</li>
					);
				})}
			</ul>
		</fieldset>
	);
}

function SyncResults({ results }: { results: readonly SyncResult[] }) {
	return (
		<ul aria-label="Sync results" className="border-b border-rule">
			{results.map((result) => (
				<li key={result.projectId} className="flex items-start gap-3 border-b border-rule px-3 py-2 last:border-b-0">
					<StateGlyph state={result.status === "synced" ? "synced" : "error"} className="mt-1" />
					<div className="min-w-0 flex-1">
						<p className="font-medium">
							{result.title}
							<span className="sr-only">{result.status === "synced" ? ": synced" : ": not synced"}</span>
						</p>
						{result.status === "synced" ? (
							<p className="text-[0.8125rem] text-muted-foreground">
								Saved to <code className="font-mono text-xs">projects/{result.newProjectId}/</code>
							</p>
						) : (
							<p className="text-[0.8125rem] text-destructive">
								{result.error} Kept on this device.
							</p>
						)}
						{result.warning ? <p className="text-[0.8125rem] text-muted-foreground">{result.warning}</p> : null}
					</div>
				</li>
			))}
		</ul>
	);
}
