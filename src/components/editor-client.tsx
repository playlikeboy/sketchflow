"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useStackApp } from "@stackframe/stack";
import type {
	AppState,
	BinaryFiles,
	ExcalidrawImperativeAPI,
	ExcalidrawInitialDataState,
	LibraryItems,
} from "@excalidraw/excalidraw/types";
import {
	ArrowLeft,
	BookOpen,
	Clock,
	FileText,
	GitBranch,
	Loader2,
	Maximize2,
	PanelsTopLeft,
	Save,
	SquarePen,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";

import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

import { ExcalidrawLibraryPanel } from "@/components/excalidraw-library-panel";
import { GithubAccessCard } from "@/components/github-access-card";
import { HistoryPanel } from "@/components/history-panel";
import { ProjectDocEditor } from "@/components/project-doc-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ApiError, commitWorkspaceFiles, restoreProjectVersion, type SketchLoadResponse, type SketchScene } from "@/lib/api";
import type { ExcalidrawLibrary } from "@/lib/excalidraw-libraries";
import { deleteDraft, getDraft, setDraft, deleteLocalProject } from "@/lib/indexeddb";
import { PROJECTS_METADATA_PATH, mergeProjectsMetadata, projectFromProjectJson } from "@/lib/project-metadata";
import { draftKey, humanizeSlug, normalizeScene, notesFilePath, projectFilePath, sketchFilePath } from "@/lib/sketchflow";
import { useAuthMe, useGithubStatus, useSketch, useProjectHistorySnapshot, useWorkspaces } from "@/lib/swr-hooks";
import { cn } from "@/lib/utils";

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

type LibraryDraftValue = {
	libraryItems: LibraryItems;
	installedSources: string[];
	updatedAt: string;
};

type StateDraftValue = {
	state: {
		viewMode: EditorMode;
		lastActiveSketchId: string;
		panelSizes?: number[];
		history?: any[];
	};
	updatedAt: string;
};

type EditorMode = "split" | "canvas" | "docs" | "libraries" | "history";

const editorModes = new Set<EditorMode>(["split", "canvas", "docs", "libraries", "history"]);

function isEditorMode(value: string | null): value is EditorMode {
	return Boolean(value && editorModes.has(value as EditorMode));
}

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

function appendProjectHistoryLog(existingHistory: any[] | undefined | null, action: string, userName: string | null | undefined) {
	const logEntry = {
		action,
		user: userName ?? "Unknown User",
		timestamp: new Date().toISOString(),
	};
	const history = Array.isArray(existingHistory) ? [...existingHistory] : [];
	history.unshift(logEntry); // Add newest at start
	return history.slice(0, 15); // keep last 15 actions
}

function toInitialData(scene: SketchScene, resolvedTheme?: string, libraryItems?: LibraryItems): ExcalidrawInitialDataState {
	const initialData: ExcalidrawInitialDataState = {
		elements: scene.elements as ExcalidrawInitialDataState["elements"],
		appState: {
			...scene.appState,
			viewBackgroundColor: resolvedTheme === "dark" && (scene.appState?.viewBackgroundColor === "#ffffff" || !scene.appState?.viewBackgroundColor)
				? "#121212"
				: scene.appState?.viewBackgroundColor ?? "#ffffff",
		} as ExcalidrawInitialDataState["appState"],
		files: scene.files as ExcalidrawInitialDataState["files"],
	};

	if (libraryItems) {
		initialData.libraryItems = libraryItems;
	}

	return initialData;
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
	const { resolvedTheme } = useTheme();
	const appRef = useRef(app);
	const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null);
	const [mounted, setMounted] = useState(false);
	const [panelSizes, setPanelSizes] = useState<number[]>([50, 50]);
	const [notes, setNotes] = useState("");
	const [source, setSource] = useState<"github" | "local">("github");
	const [saving, setSaving] = useState(false);
	const [sceneDirty, setSceneDirty] = useState(false);
	const [notesDirty, setNotesDirty] = useState(false);
	const [hasScene, setHasScene] = useState(false);
	const [status, setStatus] = useState("Loading sketch");
	const [loadError, setLoadError] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [restoringSha, setRestoringSha] = useState<string | null>(null);
	const [mode, setMode] = useState<EditorMode>("split");
	const [installedLibrarySources, setInstalledLibrarySources] = useState<string[]>([]);
	const [installingLibrarySource, setInstallingLibrarySource] = useState<string | null>(null);
	const sceneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
	const sceneRef = useRef<SketchScene | null>(null);
	const notesRef = useRef("");
	const sceneDirtyRef = useRef(false);
	const notesDirtyRef = useRef(false);
	const installedLibrarySourcesRef = useRef<string[]>([]);
	const sourceRef = useRef<"github" | "local">("github");
	const { data: auth, isLoading: authLoading } = useAuthMe();
	const { data: githubStatus, mutate: mutateGithubStatus } = useGithubStatus(auth?.user?.id);
	const { data: workspacesData } = useWorkspaces(auth?.user?.id);
	const workspace = useMemo(() => {
		return workspacesData?.workspaces?.find((w) => w.id === workspaceId) || null;
	}, [workspacesData, workspaceId]);
	const currentDraftKey = useMemo(
		() => draftKey(workspaceId, projectId, sketchId, auth?.user?.id),
		[workspaceId, projectId, sketchId, auth?.user?.id],
	);
	const currentNotesDraftKey = useMemo(
		() => `${currentDraftKey}:notes`,
		[currentDraftKey],
	);
	const currentLibraryDraftKey = useMemo(
		() => `${currentDraftKey}:library`,
		[currentDraftKey],
	);
	const currentStateDraftKey = useMemo(
		() => `${currentDraftKey}:state`,
		[currentDraftKey],
	);
	const sketchInput = auth?.authenticated ? { workspaceId, projectId, sketchId } : null;
	const {
		data,
		error: sketchError,
		isLoading: sketchLoading,
		mutate: mutateSketch,
	} = useSketch(sketchInput, auth?.user?.id);
	const [selectedPreviewSha, setSelectedPreviewSha] = useState<string | null>(null);
	const {
		data: snapshotData,
		isLoading: snapshotLoading,
	} = useProjectHistorySnapshot(workspaceId, projectId, selectedPreviewSha, auth?.user?.id);
	const previewInitialData = useMemo(() => {
		if (!snapshotData?.sketch) return null;
		return toInitialData(normalizeScene(snapshotData.sketch), resolvedTheme);
	}, [snapshotData, resolvedTheme]);
	const refreshEditorFrame = useCallback(() => {
		if (typeof window === "undefined") {
			return;
		}

		window.requestAnimationFrame(() => {
			window.dispatchEvent(new Event("resize"));
			excalidrawApiRef.current?.refresh();
		});
	}, []);
	const queueStateDraftSave = useCallback((nextMode: EditorMode, nextSizes: number[]) => {
		void setDraft<StateDraftValue>(currentStateDraftKey, {
			state: {
				viewMode: nextMode,
				lastActiveSketchId: sketchId,
				panelSizes: nextSizes,
			},
			updatedAt: new Date().toISOString(),
		});
	}, [currentStateDraftKey, sketchId]);

	const setEditorMode = useCallback((nextMode: EditorMode) => {
		setMode(nextMode);
		queueStateDraftSave(nextMode, panelSizes);

		if (typeof window === "undefined") {
			return;
		}

		const url = new URL(window.location.href);
		url.searchParams.set("view", nextMode);
		window.history.pushState({ sketchflowView: nextMode }, "", url);
		refreshEditorFrame();
	}, [refreshEditorFrame, queueStateDraftSave, panelSizes]);

	const handleLayoutChange = useCallback((sizes: any) => {
		const nextSizes = Array.isArray(sizes) ? (sizes as number[]) : [50, 50];
		setPanelSizes(nextSizes);
		queueStateDraftSave(mode, nextSizes);
		refreshEditorFrame();
	}, [mode, queueStateDraftSave, refreshEditorFrame]);

	useEffect(() => {
		appRef.current = app;
	}, [app]);

	useEffect(() => {
		setMounted(true);
	}, []);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const readModeFromUrl = () => {
			const params = new URLSearchParams(window.location.search);
			const nextMode = params.get("view");
			if (isEditorMode(nextMode)) {
				setMode(nextMode);
			}
		};

		readModeFromUrl();
		window.addEventListener("popstate", readModeFromUrl);

		return () => {
			window.removeEventListener("popstate", readModeFromUrl);
		};
	}, []);

	useEffect(() => {
		installedLibrarySourcesRef.current = installedLibrarySources;
	}, [installedLibrarySources]);

	useEffect(() => {
		if (auth && !auth.authenticated) {
			void appRef.current.redirectToSignIn();
		}
	}, [auth]);

	useEffect(() => {
		if (excalidrawApiRef.current && resolvedTheme) {
			const appState = excalidrawApiRef.current.getAppState();
			const currentBg = appState.viewBackgroundColor;
			if (resolvedTheme === "dark" && (currentBg === "#ffffff" || !currentBg)) {
				excalidrawApiRef.current.updateScene({
					appState: { viewBackgroundColor: "#121212" }
				});
			} else if (resolvedTheme === "light" && currentBg === "#121212") {
				excalidrawApiRef.current.updateScene({
					appState: { viewBackgroundColor: "#ffffff" }
				});
			}
		}
	}, [resolvedTheme]);

	useEffect(() => {
		let mounted = true;

		async function hydrateFromData(nextData: SketchLoadResponse | null) {
			setLoadError(null);
			setSaveError(null);
			setInitialData(null);
			setSelectedPreviewSha(null);
			setHasScene(false);
			sceneRef.current = null;
			sceneDirtyRef.current = false;
			notesDirtyRef.current = false;
			setSceneDirty(false);
			setNotesDirty(false);

			try {
				const [localSceneDraft, localNotesDraft, localLibraryDraft, localStateDraft] = await Promise.all([
					getDraft<DraftValue>(currentDraftKey),
					getDraft<NotesDraftValue>(currentNotesDraftKey),
					getDraft<LibraryDraftValue>(currentLibraryDraftKey),
					getDraft<StateDraftValue>(currentStateDraftKey),
				]);

				const isLocalFallback = !nextData && (localSceneDraft !== null || localNotesDraft !== null || localStateDraft !== null);

				if (!nextData && !isLocalFallback) {
					setLoadError(sketchError instanceof Error ? sketchError.message : "Project not found locally or on GitHub.");
					return;
				}

				const githubScene = nextData ? normalizeScene(nextData.sketch) : {
					type: "excalidraw",
					version: 2,
					source: "https://sketchflow.space",
					elements: [],
					appState: { viewBackgroundColor: "#ffffff" },
					files: {},
				};
				const githubState = nextData?.state;
				const initialMode = localStateDraft?.value?.state?.viewMode ?? (isEditorMode(githubState?.viewMode ?? null) ? githubState!.viewMode : "split");
				const initialPanelSizes = localStateDraft?.value?.state?.panelSizes ?? githubState?.panelSizes ?? [50, 50];
				const nextScene = localSceneDraft?.value?.scene
					? normalizeScene(localSceneDraft.value.scene)
					: githubScene;
				const nextNotes = localNotesDraft?.value?.notes ?? nextData?.notes ?? fallbackNotes(projectId, sketchId);
				const restoredLocal = Boolean(localSceneDraft?.value?.scene || localNotesDraft?.value?.notes || localStateDraft?.value?.state);
				const nextLibraryItems = localLibraryDraft?.value?.libraryItems;
				const nextInstalledSources = localLibraryDraft?.value?.installedSources ?? [];

				if (!mounted) return;

				sceneRef.current = nextScene;
				notesRef.current = nextNotes;
				installedLibrarySourcesRef.current = nextInstalledSources;
				sourceRef.current = restoredLocal || isLocalFallback ? "local" : "github";
				setInitialData(toInitialData(nextScene, resolvedTheme, nextLibraryItems));
				setPanelSizes(initialPanelSizes);
				setNotes(nextNotes);
				setMode(initialMode as EditorMode);
				setInstalledLibrarySources(nextInstalledSources);
				setHasScene(true);
				setSource(restoredLocal || isLocalFallback ? "local" : "github");
				setStatus(
					isLocalFallback
						? "Local draft (Offline)"
						: restoredLocal
							? "Restored local draft"
							: "Loaded from GitHub",
				);
			} catch (error) {
				if (!mounted) return;
				setLoadError(error instanceof Error ? error.message : "Draft could not be opened");
			}
		}

		if (data) {
			void hydrateFromData(data);
		} else if (sketchError || (!sketchLoading && !data)) {
			void hydrateFromData(null);
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
	}, [currentDraftKey, currentLibraryDraftKey, currentNotesDraftKey, data, sketchError, sketchLoading, projectId, sketchId, resolvedTheme]);

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

	const handleLibraryChange = useCallback((libraryItems: LibraryItems) => {
		void setDraft<LibraryDraftValue>(currentLibraryDraftKey, {
			libraryItems,
			installedSources: installedLibrarySourcesRef.current,
			updatedAt: new Date().toISOString(),
		});
	}, [currentLibraryDraftKey]);

	const handleInstallLibrary = useCallback(async (library: ExcalidrawLibrary) => {
		if (!excalidrawApiRef.current) {
			setStatus("Canvas is still loading");
			return;
		}

		setInstallingLibrarySource(library.source);
		setStatus(`Importing ${library.name}`);

		try {
			const response = await fetch(`/api/excalidraw/libraries/file?source=${encodeURIComponent(library.source)}`);
			if (!response.ok) {
				throw new Error("Library pack could not be downloaded");
			}

			const blob = await response.blob();
			const { loadLibraryFromBlob } = await import("@excalidraw/excalidraw");
			const libraryItems = await loadLibraryFromBlob(blob, "published");
			const updatedLibraryItems = await excalidrawApiRef.current.updateLibrary({
				libraryItems,
				merge: true,
				openLibraryMenu: true,
				defaultStatus: "published",
			});
			const nextInstalledSources = Array.from(new Set([...installedLibrarySourcesRef.current, library.source]));
			installedLibrarySourcesRef.current = nextInstalledSources;
			setInstalledLibrarySources(nextInstalledSources);
			await setDraft<LibraryDraftValue>(currentLibraryDraftKey, {
				libraryItems: updatedLibraryItems,
				installedSources: nextInstalledSources,
				updatedAt: new Date().toISOString(),
			});
			setStatus(`Imported ${library.name}`);
		} catch (libraryError) {
			setStatus(
				libraryError instanceof Error
					? libraryError.message
					: "Library import failed",
			);
		} finally {
			setInstallingLibrarySource(null);
		}
	}, [currentLibraryDraftKey]);

	async function handleManualSave() {
		const scene = sceneRef.current;
		if (!scene || (!data && !workspace)) return;

		setSaving(true);
		setSaveError(null);
		setStatus("Committing to GitHub");

		try {
			if (sceneTimer.current) {
				clearTimeout(sceneTimer.current);
			}
			if (notesTimer.current) {
				clearTimeout(notesTimer.current);
			}

			const project = buildProjectFile(projectId, sketchId, data?.project);
			const projectMetadata = mergeProjectsMetadata({
				existing: data?.projectsMetadata,
				project: projectFromProjectJson({
					projectId,
					projectJson: project,
					fallbackVisibility: data?.workspace?.visibility ?? workspace?.visibility ?? "public",
					fallbackSketchId: sketchId,
				}),
				workspace: {
					owner: data?.workspace?.repoOwner ?? workspace?.repoOwner ?? "",
					repo: data?.workspace?.repoName ?? workspace?.repoName ?? "",
					defaultBranch: data?.workspace?.defaultBranch ?? workspace?.defaultBranch ?? "main",
				},
			});
			const nextNotes = notesRef.current || fallbackNotes(projectId, sketchId);
			const nextHistory = appendProjectHistoryLog(
				data?.state?.history,
				`Saved changes (mode: ${mode})`,
				auth?.user?.displayName || auth?.user?.primaryEmail
			);
			const nextState = {
				viewMode: mode,
				lastActiveSketchId: sketchId,
				panelSizes,
				updatedAt: new Date().toISOString(),
				history: nextHistory,
			};
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
					{
						path: `projects/${projectId}/state.json`,
						content: `${JSON.stringify(nextState, null, 2)}\n`,
					},
				],
			});

			try {
				await deleteLocalProject(workspaceId, projectId);
			} catch (err) {
				console.warn("Could not delete local staged project from registry:", err);
			}

			await Promise.all([
				deleteDraft(currentDraftKey),
				deleteDraft(currentNotesDraftKey),
				deleteDraft(currentStateDraftKey),
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
					data: data || {
						workspace: workspace!,
						projectSlug: projectId,
						sketchSlug: sketchId,
						project: project,
						projectsMetadata: projectMetadata,
						sketch: scene,
						notes: nextNotes,
						state: nextState,
						files: {
							project: project,
							sketch: scene,
							notes: nextNotes,
							state: nextState,
						}
					},
					commitSha: response.commit.sha,
					projectMetadata,
					notes: nextNotes,
				}),
				{ revalidate: false },
			);
		} catch (saveError) {
			const nextMessage =
				saveError instanceof ApiError && saveError.code?.startsWith("github_")
					? "GitHub sync needs a fresh connection. Your local draft is safe."
					: saveError instanceof Error
						? saveError.message
						: "Sketch was not saved";
			setSaveError(nextMessage);
			setStatus("Local draft saved");
		} finally {
			setSaving(false);
		}
	}

	async function handleRestoreProject(sha: string) {
		if (restoringSha || !data) return;

		setRestoringSha(sha);
		setStatus("Restoring project version");

		try {
			await restoreProjectVersion(workspaceId, projectId, sha);
			
			// Clear local drafts to reload from the new remote head
			await Promise.all([
				deleteDraft(currentDraftKey),
				deleteDraft(currentNotesDraftKey),
			]);
			
			// Mutate and refresh SWR sketch state
			await mutateSketch();
			
			// Close the preview overlay
			setSelectedPreviewSha(null);
			setStatus("Project restored successfully");
		} catch (error) {
			setSaveError(
				error instanceof Error
					? error.message
					: "Could not restore project version",
			);
			setStatus("Restore failed");
		} finally {
			setRestoringSha(null);
		}
	}

	const title = humanizeSlug(sketchId);
	const subtitle = data
		? `${data.workspace.repoOwner}/${data.workspace.repoName} · projects/${projectId}`
		: workspace
			? `${workspace.repoOwner}/${workspace.repoName} · projects/${projectId} (Offline)`
			: "GitHub-backed visual doc";
	const loading = authLoading || sketchLoading || !mounted;
	const error = loadError || (sketchError instanceof Error ? sketchError.message : null);
	const dirty = sceneDirty || notesDirty;
	const panelLayout = mode === "libraries" || mode === "history"
		? {
				canvas: "64%",
				side: "36%",
				canvasMin: "44%",
				sideMin: "28%",
				sideMax: "52%",
			}
		: {
				canvas: "50%",
				side: "50%",
				canvasMin: "34%",
				sideMin: "34%",
				sideMax: "66%",
			};
	const canvasEditor = selectedPreviewSha ? (
		previewInitialData ? (
			<div className="relative h-full min-h-0">
				{snapshotLoading ? (
					<div className="absolute inset-0 z-30 grid place-items-center bg-background/50 backdrop-blur-sm">
						<Loader2 className="size-6 animate-spin text-primary" />
					</div>
				) : null}
				<div className="absolute left-1/2 top-4 z-20 flex items-center gap-3 rounded-full border bg-card px-4 py-2 text-xs font-bold shadow-md">
					<span className="inline-flex items-center gap-1.5 text-[#CE82FF]">
						<GitBranch className="size-3.5" />
						Viewing preview ({selectedPreviewSha.slice(0, 7)})
					</span>
					<Button variant="ghost" size="xs" className="h-6 px-2 hover:bg-muted" onClick={() => setSelectedPreviewSha(null)}>
						<X className="size-3" />
						Close Preview
					</Button>
				</div>
				<Excalidraw
					key={selectedPreviewSha}
					initialData={previewInitialData}
					viewModeEnabled={true}
					theme={resolvedTheme === "dark" ? "dark" : "light"}
					UIOptions={{
						tools: {
							image: false,
						},
					}}
				/>
			</div>
		) : (
			<div className="grid h-full place-items-center text-sm font-bold text-muted-foreground">
				<div className="flex items-center gap-2">
					<Loader2 className="size-4 animate-spin text-[#CE82FF]" />
					Loading preview
				</div>
			</div>
		)
	) : initialData ? (
		<div className="h-full min-h-0">
			<Excalidraw
				key={currentDraftKey}
				initialData={initialData}
				onChange={handleSceneChange}
				onLibraryChange={handleLibraryChange}
				excalidrawAPI={(api) => {
					excalidrawApiRef.current = api;
				}}
				theme={resolvedTheme === "dark" ? "dark" : "light"}
				UIOptions={{
					tools: {
						image: true,
					},
				}}
			/>
		</div>
	) : null;
	const docsPanel = selectedPreviewSha ? (
		<div className="flex h-full min-h-0 flex-col border-l bg-card p-4 overflow-y-auto">
			<div className="text-sm font-extrabold text-foreground mb-3 flex items-center justify-between gap-3 border-b pb-2">
				<span className="text-[#CE82FF]">Project docs (Preview)</span>
				<Badge variant="outline">Read-Only</Badge>
			</div>
			<div className="prose dark:prose-invert text-xs whitespace-pre-wrap font-mono rounded-lg border p-3 bg-muted/20">
				{snapshotData?.notes || "No notes saved for this version"}
			</div>
		</div>
	) : (
		<div className="flex h-full min-h-0 flex-col border-l bg-card">
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
			<ProjectDocEditor
				documentKey={currentNotesDraftKey}
				markdown={notes}
				onMarkdownChange={handleNotesChange}
			/>
		</div>
	);
	const libraryPanel = (
		<ExcalidrawLibraryPanel
			installedSources={installedLibrarySources}
			installingSource={installingLibrarySource}
			onInstall={handleInstallLibrary}
		/>
	);
	const historyPanel = (
		<HistoryPanel
			workspaceId={workspaceId}
			projectId={projectId}
			userId={auth?.user?.id}
			selectedPreviewSha={selectedPreviewSha}
			onPreviewShaChange={setSelectedPreviewSha}
			onRestore={handleRestoreProject}
			restoringSha={restoringSha}
			workspace={data?.workspace ?? workspace}
		/>
	);

	return (
		<main className="flex h-screen min-h-screen flex-col bg-background">
			<div className="h-1 w-full bg-gradient-to-r from-[#58CC02] via-[#1CB0F6] to-[#CE82FF]" />

			<header className="flex h-13 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-3 py-1.5 sm:px-4">
				<div className="flex min-w-0 items-center gap-2">
					<Button variant="ghost" size="icon-xs" asChild className="text-muted-foreground hover:text-[#58CC02] shrink-0">
						<Link href="/app" aria-label="Back to projects">
							<ArrowLeft className="size-4" />
						</Link>
					</Button>
					<Breadcrumb className="text-xs font-semibold select-none">
						<BreadcrumbList className="flex-nowrap gap-1">
							<BreadcrumbItem className="hidden sm:inline-flex max-w-[100px] truncate">
								<BreadcrumbLink asChild>
									<Link href="/app" className="text-muted-foreground/75 hover:text-primary">
										{data?.workspace?.repoName ?? workspace?.repoName ?? "Workspace"}
									</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator className="hidden sm:inline-flex text-muted-foreground/30" />
							<BreadcrumbItem className="max-w-[100px] truncate">
								<BreadcrumbLink asChild>
									<Link href={`/app?workspace=${workspaceId}`} className="text-muted-foreground/75 hover:text-primary">
										{projectId}
									</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator className="text-muted-foreground/30" />
							<BreadcrumbItem className="font-extrabold text-foreground truncate max-w-[140px]">
								<BreadcrumbPage>{title}</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>
				</div>

				<div className="flex min-w-0 items-center gap-2">
					<div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/20 p-0.5 shadow-inner">
						<Button
							variant="ghost"
							size="xs"
							onClick={() => setEditorMode("canvas")}
							className={cn(
								"h-7 rounded-md px-2 md:px-2.5 text-xs font-bold transition-all",
								mode === "canvas"
									? "bg-card text-foreground shadow-sm border border-border/50"
									: "text-muted-foreground hover:text-foreground hover:bg-transparent"
							)}
							title="Canvas Mode"
						>
							<Maximize2 className="size-3.5" />
							<span className="hidden md:inline ml-1">Canvas</span>
						</Button>
						<Button
							variant="ghost"
							size="xs"
							onClick={() => setEditorMode("split")}
							className={cn(
								"h-7 rounded-md px-2 md:px-2.5 text-xs font-bold transition-all",
								mode === "split"
									? "bg-card text-foreground shadow-sm border border-border/50"
									: "text-muted-foreground hover:text-foreground hover:bg-transparent"
							)}
							title="Split Mode"
						>
							<PanelsTopLeft className="size-3.5" />
							<span className="hidden md:inline ml-1">Split</span>
						</Button>
						<Button
							variant="ghost"
							size="xs"
							onClick={() => setEditorMode("docs")}
							className={cn(
								"h-7 rounded-md px-2 md:px-2.5 text-xs font-bold transition-all",
								mode === "docs"
									? "bg-card text-foreground shadow-sm border border-border/50"
									: "text-muted-foreground hover:text-foreground hover:bg-transparent"
							)}
							title="Docs Mode"
						>
							<FileText className="size-3.5" />
							<span className="hidden md:inline ml-1">Docs</span>
						</Button>
						<Button
							variant="ghost"
							size="xs"
							onClick={() => setEditorMode("libraries")}
							className={cn(
								"h-7 rounded-md px-2 md:px-2.5 text-xs font-bold transition-all",
								mode === "libraries"
									? "bg-card text-foreground shadow-sm border border-border/50"
									: "text-muted-foreground hover:text-foreground hover:bg-transparent"
							)}
							title="Libraries Mode"
						>
							<BookOpen className="size-3.5" />
							<span className="hidden md:inline ml-1">Libraries</span>
						</Button>
						<Button
							variant="ghost"
							size="xs"
							onClick={() => setEditorMode("history")}
							className={cn(
								"h-7 rounded-md px-2 md:px-2.5 text-xs font-bold transition-all",
								mode === "history"
									? "bg-card text-foreground shadow-sm border border-border/50"
									: "text-muted-foreground hover:text-foreground hover:bg-transparent"
							)}
							title="History Mode"
						>
							<Clock className="size-3.5" />
							<span className="hidden md:inline ml-1">History</span>
						</Button>
					</div>

					<div className="hidden items-center gap-1.5 text-xs font-semibold text-muted-foreground sm:flex">
						{saving ? (
							<span className="flex items-center gap-1">
								<Loader2 className="size-3 animate-spin text-[#58CC02]" />
								Saving...
							</span>
						) : dirty ? (
							<span className="flex items-center gap-1 text-amber-500 font-bold">
								<span className="relative flex h-2 w-2">
									<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
									<span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
								</span>
								Unsaved
							</span>
						) : !data || (status && status.includes("Offline")) ? (
							<span className="flex items-center gap-1.5 text-red-500 font-extrabold animate-pulse">
								<span className="h-1.5 w-1.5 rounded-full bg-red-500" />
								Offline (Unsynced)
							</span>
						) : (
							<span className="flex items-center gap-1 text-emerald-500/80">
								<span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
								Synced ({shortSha(data?.workspace?.latestCommitSha ?? workspace?.latestCommitSha)})
							</span>
						)}
					</div>

					<Button disabled={!hasScene || saving || (!dirty && !!data)} onClick={handleManualSave} size="sm" className="h-8 py-0 px-3.5 rounded-xl font-bold transition-all shadow-sm">
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
					<div className="relative h-full min-h-0 overflow-hidden">
						{saveError ? (
							<div className="absolute left-1/2 top-4 z-20 w-[min(520px,calc(100%-2rem))] -translate-x-1/2 rounded-xl border bg-card px-4 py-3 text-sm shadow-lg">
								<div className="flex items-start justify-between gap-3">
									<div>
										<div className="font-extrabold text-foreground">Cloud sync paused</div>
										<div className="mt-1 font-semibold text-muted-foreground">{saveError}</div>
									</div>
									<Button
										variant="ghost"
										size="icon-xs"
										onClick={() => setSaveError(null)}
										aria-label="Dismiss error"
										className="shrink-0 text-muted-foreground hover:text-foreground"
									>
										<X className="size-3.5" />
									</Button>
								</div>
								{saveError.toLowerCase().includes("github") ? (
									<div className="mt-3">
										<GithubAccessCard
											compact
											scopes={githubStatus?.scopes}
											onRecovered={async () => {
												await mutateGithubStatus();
												setSaveError(null);
											}}
										/>
									</div>
								) : null}
							</div>
						) : null}
						{mode === "canvas" ? (
							canvasEditor
						) : mode === "docs" ? (
							<div className="h-full min-h-0">{docsPanel}</div>
						) : (
							<ResizablePanelGroup
								key={mode}
								id={`editor-${mode}-layout`}
								orientation="horizontal"
								className="h-full min-h-0"
								onLayoutChanged={handleLayoutChange}
							>
								<ResizablePanel
									id={`editor-${mode}-canvas`}
									defaultSize={panelSizes[0] ?? (mode === "libraries" || mode === "history" ? 64 : 50)}
									minSize={mode === "libraries" || mode === "history" ? 44 : 34}
								>
									{canvasEditor}
								</ResizablePanel>
								<ResizableHandle withHandle />
								<ResizablePanel
									id={`editor-${mode}-side`}
									defaultSize={panelSizes[1] ?? (mode === "libraries" || mode === "history" ? 36 : 50)}
									minSize={mode === "libraries" || mode === "history" ? 28 : 34}
									maxSize={mode === "libraries" || mode === "history" ? 52 : 66}
								>
									{mode === "libraries" ? libraryPanel : mode === "history" ? historyPanel : docsPanel}
								</ResizablePanel>
							</ResizablePanelGroup>
						)}
					</div>
				) : null}
			</section>
		</main>
	);
}
