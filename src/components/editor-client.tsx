"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useStackApp } from "@stackframe/stack";
import type { AppState, BinaryFiles, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import {
	ArrowLeft,
	FileText,
	GitBranch,
	Loader2,
	Maximize2,
	PanelsTopLeft,
	Save,
	SquarePen,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { commitWorkspaceFiles, type SketchLoadResponse, type SketchScene } from "@/lib/api";
import { deleteDraft, getDraft, setDraft } from "@/lib/indexeddb";
import { PROJECTS_METADATA_PATH, mergeProjectsMetadata, projectFromProjectJson } from "@/lib/project-metadata";
import { draftKey, humanizeSlug, normalizeScene, notesFilePath, projectFilePath, sketchFilePath } from "@/lib/sketchflow";
import { useAuthMe, useSketch } from "@/lib/swr-hooks";

const Excalidraw = dynamic(async () => (await import("@excalidraw/excalidraw")).Excalidraw, {
	ssr: false,
	loading: () => (
		<div className="grid h-full place-items-center text-sm font-bold text-muted-foreground">
			<div className="flex items-center gap-2">
				<Loader2 className="size-4 animate-spin text-[#58CC02]" />
				Loading editor
			</div>
		</div>
	),
});

type DraftValue = {
	scene: SketchScene;
	updatedAt: string;
};

type NotesDraftValue = {
	notes: string;
	updatedAt: string;
};

type EditorMode = "split" | "canvas" | "docs";

function shortSha(value: string | null | undefined) {
	return value ? value.slice(0, 7) : "pending";
}

function cleanAppState(appState: AppState): Record<string, unknown> {
	const {
		collaborators: _collaborators,
		currentChartType: _currentChartType,
		openDialog: _openDialog,
		openPopup: _openPopup,
		openSidebar: _openSidebar,
		resizingElement: _resizingElement,
		selectionElement: _selectionElement,
		suggestedBindings: _suggestedBindings,
		...rest
	} = appState;

	return rest as unknown as Record<string, unknown>;
}

function toInitialData(scene: SketchScene): ExcalidrawInitialDataState {
	return {
		elements: scene.elements as ExcalidrawInitialDataState["elements"],
		appState: scene.appState as ExcalidrawInitialDataState["appState"],
		files: scene.files as ExcalidrawInitialDataState["files"],
	};
}

function buildProjectFile(projectId: string, sketchId: string, existingProject: unknown) {
	const now = new Date().toISOString();
	const base = existingProject && typeof existingProject === "object" ? existingProject : {};

	const existingVisibility =
		"visibility" in base && (base as { visibility?: unknown }).visibility === "private"
			? "private"
			: "public";
	const currentSketch = {
		id: sketchId,
		title: humanizeSlug(sketchId),
		file: sketchFilePath(projectId, sketchId),
	};
	const existingSketches = Array.isArray((base as { sketches?: unknown }).sketches)
		? ((base as { sketches: unknown[] }).sketches.filter(
				(sketch) =>
					typeof sketch === "object" &&
					sketch !== null &&
					(sketch as { id?: unknown }).id !== sketchId,
			) as unknown[])
		: [];

	return {
		...base,
		schemaVersion: 1,
		id: projectId,
		title: humanizeSlug(projectId),
		projectFile: projectFilePath(projectId),
		defaultSketch: sketchFilePath(projectId, sketchId),
		updatedAt: now,
		visibility: existingVisibility,
		sketches: [currentSketch, ...existingSketches],
		docs: {
			notes: notesFilePath(projectId),
		},
		sharing: {
			enabled: existingVisibility === "public",
			embed: existingVisibility === "public",
		},
	};
}

function fallbackNotes(projectId: string, sketchId: string) {
	return `# ${humanizeSlug(projectId)}\n\nSketch notes for ${humanizeSlug(sketchId)}.\n`;
}

function buildUpdatedSketchData(input: {
	data: SketchLoadResponse;
	commitSha: string;
	projectMetadata: SketchLoadResponse["projectsMetadata"];
	notes: string;
}) {
	return {
		...input.data,
		notes: input.notes,
		projectsMetadata: input.projectMetadata,
		workspace: {
			...input.data.workspace,
			latestCommitSha: input.commitSha,
		},
	} satisfies SketchLoadResponse;
}

export function EditorClient({
	workspaceId,
	projectId,
	sketchId,
}: {
	workspaceId: string;
	projectId: string;
	sketchId: string;
}) {
	const app = useStackApp();
	const appRef = useRef(app);
	const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null);
	const [notes, setNotes] = useState("");
	const [source, setSource] = useState<"github" | "local">("github");
	const [saving, setSaving] = useState(false);
	const [sceneDirty, setSceneDirty] = useState(false);
	const [notesDirty, setNotesDirty] = useState(false);
	const [hasScene, setHasScene] = useState(false);
	const [status, setStatus] = useState("Loading sketch");
	const [localError, setLocalError] = useState<string | null>(null);
	const [mode, setMode] = useState<EditorMode>("split");
	const sceneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const sceneRef = useRef<SketchScene | null>(null);
	const notesRef = useRef("");
	const sceneDirtyRef = useRef(false);
	const notesDirtyRef = useRef(false);
	const sourceRef = useRef<"github" | "local">("github");
	const currentDraftKey = useMemo(
		() => draftKey(workspaceId, projectId, sketchId),
		[workspaceId, projectId, sketchId],
	);
	const currentNotesDraftKey = useMemo(
		() => `${currentDraftKey}:notes`,
		[currentDraftKey],
	);
	const { data: auth, isLoading: authLoading } = useAuthMe();
	const sketchInput = auth?.authenticated ? { workspaceId, projectId, sketchId } : null;
	const {
		data,
		error: sketchError,
		isLoading: sketchLoading,
		mutate: mutateSketch,
	} = useSketch(sketchInput);

	useEffect(() => {
		appRef.current = app;
	}, [app]);

	useEffect(() => {
		if (auth && !auth.authenticated) {
			void appRef.current.redirectToSignIn();
		}
	}, [auth]);

	useEffect(() => {
		let mounted = true;

		async function hydrateFromData(nextData: SketchLoadResponse) {
			setLocalError(null);
			setInitialData(null);
			setHasScene(false);
			sceneRef.current = null;
			sceneDirtyRef.current = false;
			notesDirtyRef.current = false;
			setSceneDirty(false);
			setNotesDirty(false);

			try {
				const githubScene = normalizeScene(nextData.sketch);
				const [localSceneDraft, localNotesDraft] = await Promise.all([
					getDraft<DraftValue>(currentDraftKey),
					getDraft<NotesDraftValue>(currentNotesDraftKey),
				]);
				const nextScene = localSceneDraft?.value?.scene
					? normalizeScene(localSceneDraft.value.scene)
					: githubScene;
				const nextNotes = localNotesDraft?.value?.notes ?? nextData.notes ?? fallbackNotes(projectId, sketchId);
				const restoredLocal = Boolean(localSceneDraft?.value?.scene || localNotesDraft?.value?.notes);

				if (!mounted) return;

				sceneRef.current = nextScene;
				notesRef.current = nextNotes;
				sourceRef.current = restoredLocal ? "local" : "github";
				setInitialData(toInitialData(nextScene));
				setNotes(nextNotes);
				setHasScene(true);
				setSource(restoredLocal ? "local" : "github");
				setStatus(
					restoredLocal
						? "Restored local draft"
						: "Loaded from GitHub",
				);
			} catch (error) {
				if (!mounted) return;
				setLocalError(error instanceof Error ? error.message : "Draft could not be opened");
			}
		}

		if (data) {
			void hydrateFromData(data);
		}

		return () => {
			mounted = false;
			if (sceneTimer.current) {
				clearTimeout(sceneTimer.current);
			}
			if (notesTimer.current) {
				clearTimeout(notesTimer.current);
			}
		};
	}, [currentDraftKey, currentNotesDraftKey, data, projectId, sketchId]);

	const queueSceneDraftSave = useCallback((nextScene: SketchScene) => {
		if (sceneTimer.current) {
			clearTimeout(sceneTimer.current);
		}

		sceneTimer.current = setTimeout(() => {
			void setDraft<DraftValue>(currentDraftKey, {
				scene: nextScene,
				updatedAt: new Date().toISOString(),
			}).then((record) => {
				if (record) {
					setStatus(`Canvas draft saved ${new Date(record.updatedAt).toLocaleTimeString()}`);
				}
			});
		}, 500);
	}, [currentDraftKey]);

	const queueNotesDraftSave = useCallback((nextNotes: string) => {
		if (notesTimer.current) {
			clearTimeout(notesTimer.current);
		}

		notesTimer.current = setTimeout(() => {
			void setDraft<NotesDraftValue>(currentNotesDraftKey, {
				notes: nextNotes,
				updatedAt: new Date().toISOString(),
			}).then((record) => {
				if (record) {
					setStatus(`Docs draft saved ${new Date(record.updatedAt).toLocaleTimeString()}`);
				}
			});
		}, 500);
	}, [currentNotesDraftKey]);

	const handleSceneChange = useCallback((elements: readonly unknown[], appState: AppState, files: BinaryFiles) => {
		const nextScene = normalizeScene({
			...(sceneRef.current ?? {}),
			elements: [...elements],
			appState: cleanAppState(appState),
			files,
		});

		sceneRef.current = nextScene;

		if (!sceneDirtyRef.current) {
			sceneDirtyRef.current = true;
			setSceneDirty(true);
		}

		if (sourceRef.current !== "local") {
			sourceRef.current = "local";
			setSource("local");
		}

		queueSceneDraftSave(nextScene);
	}, [queueSceneDraftSave]);

	const handleNotesChange = useCallback((value: string) => {
		notesRef.current = value;
		setNotes(value);

		if (!notesDirtyRef.current) {
			notesDirtyRef.current = true;
			setNotesDirty(true);
		}

		if (sourceRef.current !== "local") {
			sourceRef.current = "local";
			setSource("local");
		}

		queueNotesDraftSave(value);
	}, [queueNotesDraftSave]);

	async function handleManualSave() {
		const scene = sceneRef.current;
		if (!scene || !data) return;

		setSaving(true);
		setLocalError(null);
		setStatus("Committing to GitHub");

		try {
			if (sceneTimer.current) {
				clearTimeout(sceneTimer.current);
			}
			if (notesTimer.current) {
				clearTimeout(notesTimer.current);
			}

			const project = buildProjectFile(projectId, sketchId, data.project);
			const projectMetadata = mergeProjectsMetadata({
				existing: data.projectsMetadata,
				project: projectFromProjectJson({
					projectId,
					projectJson: project,
					fallbackVisibility: data.workspace.visibility,
					fallbackSketchId: sketchId,
				}),
				workspace: {
					owner: data.workspace.repoOwner,
					repo: data.workspace.repoName,
					defaultBranch: data.workspace.defaultBranch,
				},
			});
			const nextNotes = notesRef.current || fallbackNotes(projectId, sketchId);
			const response = await commitWorkspaceFiles({
				workspaceId,
				message: `Update ${humanizeSlug(projectId)} visual doc`,
				files: [
					{
						path: projectFilePath(projectId),
						content: `${JSON.stringify(project, null, 2)}\n`,
					},
					{
						path: sketchFilePath(projectId, sketchId),
						content: `${JSON.stringify(scene, null, 2)}\n`,
					},
					{
						path: notesFilePath(projectId),
						content: nextNotes.endsWith("\n") ? nextNotes : `${nextNotes}\n`,
					},
					{
						path: PROJECTS_METADATA_PATH,
						content: `${JSON.stringify(projectMetadata, null, 2)}\n`,
					},
				],
			});

			await Promise.all([
				deleteDraft(currentDraftKey),
				deleteDraft(currentNotesDraftKey),
			]);
			sceneDirtyRef.current = false;
			notesDirtyRef.current = false;
			sourceRef.current = "github";
			setSceneDirty(false);
			setNotesDirty(false);
			setSource("github");
			setStatus(`Synced to GitHub · ${shortSha(response.commit.sha)}`);
			await mutateSketch(
				buildUpdatedSketchData({
					data,
					commitSha: response.commit.sha,
					projectMetadata,
					notes: nextNotes,
				}),
				{ revalidate: false },
			);
		} catch (saveError) {
			setLocalError(
				saveError instanceof Error
					? saveError.message
					: "Sketch was not saved",
			);
			setStatus("Save failed");
		} finally {
			setSaving(false);
		}
	}

	const title = humanizeSlug(sketchId);
	const subtitle = data
		? `${data.workspace.repoOwner}/${data.workspace.repoName} · projects/${projectId}`
		: "GitHub-backed visual doc";
	const loading = authLoading || sketchLoading;
	const error = localError || (sketchError instanceof Error ? sketchError.message : null);
	const dirty = sceneDirty || notesDirty;

	return (
		<main className="flex h-screen min-h-screen flex-col bg-background">
			<div className="h-1 w-full bg-gradient-to-r from-[#58CC02] via-[#1CB0F6] to-[#CE82FF]" />

			<header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b-2 border-border bg-background px-3 sm:px-4">
				<div className="flex min-w-0 items-center gap-3">
					<Button variant="ghost" size="icon-sm" asChild className="text-muted-foreground hover:text-[#58CC02]">
						<Link href="/app" aria-label="Back to projects">
							<ArrowLeft className="size-4" />
						</Link>
					</Button>
					<div className="min-w-0">
						<h1 className="truncate text-base font-extrabold text-foreground">{title}</h1>
						<p className="hidden truncate text-sm font-semibold text-muted-foreground sm:block">{subtitle}</p>
					</div>
				</div>

				<div className="flex min-w-0 items-center gap-2">
					<div className="hidden items-center gap-1 rounded-[16px] border bg-muted p-1 md:flex">
						<Button
							variant={mode === "canvas" ? "secondary" : "ghost"}
							size="xs"
							onClick={() => setMode("canvas")}
						>
							<Maximize2 className="size-3.5" />
							Canvas
						</Button>
						<Button
							variant={mode === "split" ? "secondary" : "ghost"}
							size="xs"
							onClick={() => setMode("split")}
						>
							<PanelsTopLeft className="size-3.5" />
							Split
						</Button>
						<Button
							variant={mode === "docs" ? "secondary" : "ghost"}
							size="xs"
							onClick={() => setMode("docs")}
						>
							<FileText className="size-3.5" />
							Docs
						</Button>
					</div>
					<Badge variant="secondary" className="hidden gap-1.5 font-extrabold md:inline-flex">
						<GitBranch className="size-3" />
						{dirty ? "Local draft" : `Synced ${shortSha(data?.workspace.latestCommitSha)}`}
					</Badge>
					<Badge variant="outline" className="hidden font-extrabold lg:inline-flex">
						{source === "local" ? "Autosaved locally" : status}
					</Badge>
					<Button disabled={!hasScene || saving} onClick={handleManualSave}>
						{saving ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							<Save className="size-4" />
						)}
						Save
					</Button>
				</div>
			</header>

			<section className="min-h-0 flex-1 bg-background">
				{loading ? (
					<div className="grid h-full place-items-center text-sm font-bold text-muted-foreground">
						<div className="flex items-center gap-2">
							<Loader2 className="size-4 animate-spin text-[#58CC02]" />
							Opening visual doc
						</div>
					</div>
				) : error ? (
					<div className="grid h-full place-items-center p-6">
						<div className="max-w-md rounded-[16px] border-2 border-border bg-card p-5 text-sm font-bold text-muted-foreground shadow-[0_2px_0_var(--border)]">
							{error}
						</div>
					</div>
				) : initialData ? (
					<div
						className={
							mode === "split"
								? "grid h-full grid-cols-[minmax(0,1fr)_380px]"
								: "h-full"
						}
					>
						<div className={mode === "docs" ? "hidden" : "min-h-0"}>
							<Excalidraw key={currentDraftKey} initialData={initialData} onChange={handleSceneChange} />
						</div>
						<div
							className={
								mode === "canvas"
									? "hidden"
									: "flex h-full min-h-0 flex-col border-l-2 border-border bg-card"
							}
						>
							<div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
								<div className="flex min-w-0 items-center gap-2">
									<SquarePen className="size-4 text-[#1CB0F6]" />
									<div className="min-w-0">
										<div className="truncate text-sm font-extrabold text-foreground">Project docs</div>
										<div className="truncate text-xs font-semibold text-muted-foreground">
											{notesFilePath(projectId)}
										</div>
									</div>
								</div>
								<Badge variant={notesDirty ? "default" : "secondary"}>
									{notesDirty ? "Draft" : "Saved"}
								</Badge>
							</div>
							<Textarea
								value={notes}
								onChange={(event) => handleNotesChange(event.target.value)}
								placeholder="Write docs, decisions, todos, prompts, PRD notes..."
								className="h-full min-h-0 flex-1 resize-none rounded-none border-0 bg-card p-4 font-mono text-sm leading-6 shadow-none focus-visible:ring-0"
							/>
						</div>
					</div>
				) : null}
			</section>
		</main>
	);
}
