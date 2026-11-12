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
	ChevronDown,
	Download,
	GitBranch,
	GitFork,
	Loader2,
	Maximize2,
	PanelsTopLeft,
	Save,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";

import { ExcalidrawLibraryPanel } from "@/components/excalidraw-library-panel";
import { GithubAccessCard } from "@/components/github-access-card";
import { HistoryPanel } from "@/components/history-panel";
import { ProjectDocEditor } from "@/components/project-doc-editor";
import { ThemeToggle } from "@/components/theme-toggle";
import { StateGlyph, StateMark } from "@/components/state-mark";
import { TitleBlock, TitleBlockRow } from "@/components/title-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { ApiError, commitWorkspaceFiles, restoreProjectVersion, type SketchLoadResponse, type SketchScene } from "@/lib/api";
import type { ExcalidrawLibrary } from "@/lib/excalidraw-libraries";
import { deleteDraft, getDraft, setDraft, deleteLocalProject, type OfflineCommit, getOfflineCommits, saveOfflineCommit, clearOfflineCommits } from "@/lib/indexeddb";
import { PROJECTS_METADATA_PATH, mergeProjectsMetadata, projectFromProjectJson } from "@/lib/project-metadata";
import { draftKey, humanizeSlug, normalizeScene, notesFilePath, projectFilePath, sketchFilePath, slugify } from "@/lib/sketchflow";
import { useAuthMe, useGithubStatus, useSketch, useProjectHistorySnapshot, useWorkspaces } from "@/lib/swr-hooks";
import { cn } from "@/lib/utils";

const Excalidraw = dynamic(async () => (await import("@excalidraw/excalidraw")).Excalidraw, {
	ssr: false,
	loading: () => (
		<div className="grid h-full place-items-center text-sm text-muted-foreground">
			<div className="flex items-center gap-2">
				<Loader2 className="size-4 animate-spin" />
				Loading canvas
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

type EditorMode = "split" | "canvas" | "docs" | "libraries" | "history" | "source-control";

const editorModes = new Set<EditorMode>(["split", "canvas", "docs", "libraries", "history", "source-control"]);

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

function isDarkColor(color: string | null | undefined): boolean {
	if (!color) return true;
	const c = color.trim().toLowerCase();
	if (c === "#000000" || c === "#000" || c === "#1e1e1e" || c === "#121212" || c === "#262626" || c === "#333333" || c === "#4b4b4b" || c === "black") {
		return true;
	}
	if (c.startsWith("#") && (c.length === 7 || c.length === 4)) {
		const hex = c.length === 4 ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}` : c;
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
			const lum = 0.299 * r + 0.587 * g + 0.114 * b;
			return lum < 65;
		}
	}
	return false;
}

function isLightColor(color: string | null | undefined): boolean {
	if (!color) return false;
	const c = color.trim().toLowerCase();
	if (c === "#ffffff" || c === "#fff" || c === "#f8f9fa" || c === "#f0f0f0" || c === "#e0e0e0" || c === "#f7f7f7" || c === "#f5f5f5" || c === "white") {
		return true;
	}
	if (c.startsWith("#") && (c.length === 7 || c.length === 4)) {
		const hex = c.length === 4 ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}` : c;
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
			const lum = 0.299 * r + 0.587 * g + 0.114 * b;
			return lum > 195;
		}
	}
	return false;
}

function ensureVisibleStrokeColors(elements: readonly any[], isDark: boolean): any[] {
	if (!elements || !Array.isArray(elements)) return [];
	return elements.map((el) => {
		if (!el) return el;
		const stroke = el.strokeColor;
		if (isDark) {
			if (isDarkColor(stroke)) {
				return { ...el, strokeColor: "#ffffff" };
			}
		} else {
			if (isLightColor(stroke)) {
				return { ...el, strokeColor: "#1e1e1e" };
			}
		}
		return el;
	});
}

function toInitialData(scene: SketchScene, resolvedTheme?: string, libraryItems?: LibraryItems): ExcalidrawInitialDataState {
	const isDark = (resolvedTheme ?? "dark") === "dark";
	const targetBg = isDark ? "#000000" : "#ffffff";
	const targetStroke = isDark ? "#ffffff" : "#1e1e1e";
	const elements = ensureVisibleStrokeColors(scene.elements || [], isDark);

	const sceneBg = String((scene.appState as any)?.viewBackgroundColor || "").trim().toLowerCase();
	const isDefaultOrNeutralBg =
		!sceneBg ||
		sceneBg === "#ffffff" ||
		sceneBg === "#fff" ||
		sceneBg === "#121212" ||
		sceneBg === "#1a1a1a" ||
		sceneBg === "#000000" ||
		sceneBg === "#000" ||
		sceneBg === "#f8f9fa" ||
		sceneBg === "transparent";

	const viewBackgroundColor = isDefaultOrNeutralBg ? targetBg : scene.appState?.viewBackgroundColor ?? targetBg;

	const initialData: ExcalidrawInitialDataState = {
		elements: elements as ExcalidrawInitialDataState["elements"],
		appState: {
			...scene.appState,
			viewBackgroundColor,
			currentItemStrokeColor: targetStroke,
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

function fallbackNotes(projectId: string, _sketchId: string) {
	return `# ${humanizeSlug(projectId)}\n\nProject documentation and notes.\n`;
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
	const [splitPanelSizes, setSplitPanelSizes] = useState<number[]>([50, 50]);
	const [sidePanelSizes, setSidePanelSizes] = useState<number[]>([64, 36]);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const isDraggingRef = useRef(false);
	const [isResizing, setIsResizing] = useState(false);
	const [excalidrawApi, setExcalidrawApi] = useState<ExcalidrawImperativeAPI | null>(null);

	// Source Control states
	const [offlineCommits, setOfflineCommits] = useState<OfflineCommit[]>([]);
	const [commitMessage, setCommitMessage] = useState("");
	const [syncingOffline, setSyncingOffline] = useState(false);
	const [isOnline, setIsOnline] = useState(typeof window !== "undefined" ? navigator.onLine : true);

	// Fork Modal states
	const [showForkModal, setShowForkModal] = useState(false);
	const [targetWorkspaceId, setTargetWorkspaceId] = useState("");
	const [targetProjectSlug, setTargetProjectSlug] = useState(projectId);
	const [forking, setForking] = useState(false);
	const [forkError, setForkError] = useState<string | null>(null);
	const [notes, setNotes] = useState("");
	const [source, setSource] = useState<"github" | "local">("github");
	const [saving, setSaving] = useState(false);
	const [sceneDirty, setSceneDirty] = useState(false);
	const [notesDirty, setNotesDirty] = useState(false);
	const [hasScene, setHasScene] = useState(false);
	const [status, setStatus] = useState("Loading sketch");
	const [sheetInfoOpen, setSheetInfoOpen] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [conflict, setConflict] = useState(false);
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
	const hydrateRef = useRef(false);
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
	const sketchInput = { workspaceId, projectId, sketchId };
	const {
		data,
		error: sketchError,
		isLoading: sketchLoading,
		mutate: mutateSketch,
	} = useSketch(sketchInput, auth?.user?.id);
	const activeWorkspace = data?.workspace ?? workspace;
	const isOwner = useMemo(() => {
		if (!activeWorkspace) return false;
		return Boolean(auth?.authenticated && auth?.user?.id === activeWorkspace.stackUserId);
	}, [auth, activeWorkspace]);
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

	const lastPrimaryModeRef = useRef<"canvas" | "split" | "docs">("split");

	const setEditorMode = useCallback((nextMode: EditorMode) => {
		if (nextMode === "canvas" || nextMode === "split" || nextMode === "docs") {
			lastPrimaryModeRef.current = nextMode;
		}
		setMode(nextMode);
		queueStateDraftSave(nextMode, splitPanelSizes);

		if (typeof window === "undefined") {
			return;
		}

		const url = new URL(window.location.href);
		url.searchParams.set("view", nextMode);
		window.history.pushState({ sketchflowView: nextMode }, "", url);
		refreshEditorFrame();
	}, [refreshEditorFrame, queueStateDraftSave, splitPanelSizes]);

	const toggleDrawer = useCallback((drawerMode: "libraries" | "history" | "source-control") => {
		if (mode === drawerMode) {
			setEditorMode(lastPrimaryModeRef.current);
		} else {
			setEditorMode(drawerMode);
		}
	}, [mode, setEditorMode]);

	const handleMouseDown = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		isDraggingRef.current = true;
		setIsResizing(true);
		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";
	}, []);

	useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			if (!isDraggingRef.current || !containerRef.current) return;
			const rect = containerRef.current.getBoundingClientRect();
			const posX = e.clientX - rect.left;
			let percentage = (posX / rect.width) * 100;

			// Constraints
			const min = mode === "libraries" || mode === "history" || mode === "source-control" ? 44 : 34;
			const max = mode === "libraries" || mode === "history" || mode === "source-control" ? 72 : 66;
			if (percentage < min) percentage = min;
			if (percentage > max) percentage = max;

			const nextSizes = [percentage, 100 - percentage];
			if (mode === "split") {
				setSplitPanelSizes(nextSizes);
				queueStateDraftSave(mode, nextSizes);
			} else {
				setSidePanelSizes(nextSizes);
			}
			refreshEditorFrame();
		};

		const handleMouseUp = () => {
			if (isDraggingRef.current) {
				isDraggingRef.current = false;
				setIsResizing(false);
				document.body.style.cursor = "";
				document.body.style.userSelect = "";
			}
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
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
		if (auth && !auth.authenticated && data && data.workspace?.visibility === "private") {
			void appRef.current.redirectToSignIn();
		}
	}, [auth, data]);

	useEffect(() => {
		const api = excalidrawApi || excalidrawApiRef.current;
		if (api && hasScene) {
			const isDark = (resolvedTheme ?? "dark") === "dark";
			const targetBg = isDark ? "#000000" : "#ffffff";
			const targetStroke = isDark ? "#ffffff" : "#1e1e1e";
			const appState = api.getAppState();
			const currentBg = (appState.viewBackgroundColor || "").trim().toLowerCase();
			const isDefaultOrNeutralBg =
				!currentBg ||
				currentBg === "#ffffff" ||
				currentBg === "#fff" ||
				currentBg === "#121212" ||
				currentBg === "#1a1a1a" ||
				currentBg === "#000000" ||
				currentBg === "#000" ||
				currentBg === "#f8f9fa" ||
				currentBg === "transparent";

			const currentElements = api.getSceneElements();
			const updatedElements = ensureVisibleStrokeColors(currentElements, isDark);

			api.updateScene({
				elements: updatedElements,
				appState: {
					viewBackgroundColor: isDefaultOrNeutralBg ? targetBg : appState.viewBackgroundColor,
					currentItemStrokeColor: targetStroke,
				},
			});
			api.refresh();

			if (sceneRef.current) {
				sceneRef.current = {
					...sceneRef.current,
					elements: updatedElements,
					appState: {
						...(sceneRef.current.appState || {}),
						viewBackgroundColor: isDefaultOrNeutralBg ? targetBg : sceneRef.current.appState?.viewBackgroundColor,
						currentItemStrokeColor: targetStroke,
					},
				};
			}
		}
	}, [excalidrawApi, resolvedTheme, hasScene]);

	useEffect(() => {
		hydrateRef.current = false;
	}, [currentDraftKey]);

	useEffect(() => {
		let mounted = true;

		async function hydrateFromData(nextData: SketchLoadResponse | null) {
			if (hydrateRef.current) return;
			hydrateRef.current = true;

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
					// Still waiting on GitHub with nothing local to show: keep the loading state
					// instead of flashing "not found" before the first response arrives.
					if (sketchLoading && !sketchError) {
						hydrateRef.current = false;
						return;
					}
					setLoadError(sketchError instanceof Error ? sketchError.message : "Project not found locally or on GitHub.");
					return;
				}

				const isDarkDefault = (resolvedTheme ?? "dark") === "dark";
				const githubScene = nextData ? normalizeScene(nextData.sketch) : {
					type: "excalidraw",
					version: 2,
					source: "https://sketchflow.space",
					elements: [],
					appState: { viewBackgroundColor: isDarkDefault ? "#000000" : "#ffffff" },
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
				setSplitPanelSizes(initialPanelSizes);
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
			hydrateRef.current = false;
			void hydrateFromData(data);
		} else if (!hydrateRef.current) {
			hydrateRef.current = false;
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
	}, [currentDraftKey, currentLibraryDraftKey, currentNotesDraftKey, data, sketchError, sketchLoading, projectId, sketchId]);

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
		if (!isOwner) return;
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
	}, [queueSceneDraftSave, isOwner]);

	const handleNotesChange = useCallback((value: string) => {
		if (!isOwner) return;
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
	}, [queueNotesDraftSave, isOwner]);

	const handleLibraryChange = useCallback((libraryItems: LibraryItems) => {
		if (!isOwner) return;
		void setDraft<LibraryDraftValue>(currentLibraryDraftKey, {
			libraryItems,
			installedSources: installedLibrarySourcesRef.current,
			updatedAt: new Date().toISOString(),
		});
	}, [currentLibraryDraftKey, isOwner]);

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

	/**
	 * `overwrite` commits on top of whatever is on the branch now. It is only used after the
	 * user has been told the project changed on GitHub and chose to keep their own version.
	 */
	async function handleManualSave(options: { overwrite?: boolean } = {}) {
		const scene = sceneRef.current;
		if (!scene || (!data && !workspace)) return;

		setSaving(true);
		setSaveError(null);
		setConflict(false);
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
				panelSizes: splitPanelSizes,
				updatedAt: new Date().toISOString(),
				history: nextHistory,
			};
			const response = await commitWorkspaceFiles({
				workspaceId,
				message: `Update ${humanizeSlug(projectId)} visual doc`,
				expectedHeadSha: options.overwrite ? null : data?.workspace?.latestCommitSha ?? workspace?.latestCommitSha ?? null,
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
				await deleteLocalProject(workspaceId, projectId, auth?.user?.id);
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
			if (saveError instanceof ApiError && saveError.code === "github_conflict") {
				setConflict(true);
				setStatus("Local draft saved");
				return;
			}
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

	function downloadMyVersion() {
		const save = (filename: string, content: string, type: string) => {
			const url = URL.createObjectURL(new Blob([content], { type }));
			const link = document.createElement("a");
			link.href = url;
			link.download = filename;
			link.click();
			URL.revokeObjectURL(url);
		};
		if (sceneRef.current) {
			save(`${projectId}.excalidraw`, `${JSON.stringify(sceneRef.current, null, 2)}\n`, "application/json");
		}
		save(`${projectId}-notes.md`, notesRef.current, "text/markdown");
	}

	/** Drop the local draft and load what GitHub has. */
	async function useGithubVersion() {
		if (sceneTimer.current) clearTimeout(sceneTimer.current);
		if (notesTimer.current) clearTimeout(notesTimer.current);
		await Promise.all([deleteDraft(currentDraftKey), deleteDraft(currentNotesDraftKey), deleteDraft(currentStateDraftKey)]);
		window.location.reload();
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

	const loadOfflineCommits = useCallback(async () => {
		const list = await getOfflineCommits(workspaceId, projectId, auth?.user?.id);
		setOfflineCommits(list);
	}, [workspaceId, projectId, auth?.user?.id]);

	useEffect(() => {
		void loadOfflineCommits();
	}, [loadOfflineCommits]);

	const handleOfflineCommit = useCallback(async () => {
		const scene = sceneRef.current;
		if (!scene || (!data && !workspace)) return;
		if (!commitMessage.trim()) return;

		const commitId = crypto.randomUUID();
		const timestamp = new Date().toISOString();
		const authorName = auth?.user?.displayName || auth?.user?.primaryEmail || "Local User";

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
			`Commit: ${commitMessage.trim()}`,
			authorName
		);
		const nextState = {
			viewMode: mode,
			lastActiveSketchId: sketchId,
			panelSizes: splitPanelSizes,
			updatedAt: timestamp,
			history: nextHistory,
		};

		const commit: OfflineCommit = {
			id: commitId,
			baseCommitSha: data?.workspace?.latestCommitSha ?? workspace?.latestCommitSha ?? null,
			message: commitMessage.trim(),
			timestamp,
			author: authorName,
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
		};

		try {
			await saveOfflineCommit(workspaceId, projectId, commit, auth?.user?.id);
			setCommitMessage("");
			setSceneDirty(false);
			setNotesDirty(false);
			sceneDirtyRef.current = false;
			notesDirtyRef.current = false;
			setStatus("Staged local offline commit");
			await loadOfflineCommits();
		} catch (err) {
			console.error("Failed to stash offline commit:", err);
			setSaveError("Failed to save local commit draft.");
		}
	}, [workspaceId, projectId, sketchId, commitMessage, data, workspace, auth, mode, splitPanelSizes, loadOfflineCommits]);

	const handleSyncOfflineCommits = useCallback(async () => {
		if (offlineCommits.length === 0 || syncingOffline) return;

		setSyncingOffline(true);
		setStatus(`Syncing ${offlineCommits.length} local commits`);
		setSaveError(null);

		try {
			let expectedHeadSha = data?.workspace?.latestCommitSha ?? workspace?.latestCommitSha ?? null;
			for (const commit of offlineCommits) {
				const response = await commitWorkspaceFiles({
					workspaceId,
					message: commit.message,
					files: commit.files,
					expectedHeadSha: expectedHeadSha,
				});
				expectedHeadSha = response.commit.sha;
			}

			try {
				await deleteLocalProject(workspaceId, projectId, auth?.user?.id);
			} catch (err) {
				console.warn("Could not delete local staged project from registry:", err);
			}

			await Promise.all([
				deleteDraft(currentDraftKey),
				deleteDraft(currentNotesDraftKey),
				deleteDraft(currentStateDraftKey),
			]);

			await clearOfflineCommits(workspaceId, projectId, auth?.user?.id);
			setOfflineCommits([]);
			setStatus("Offline commits synced to GitHub");
			await mutateSketch();
		} catch (err) {
			const nextMessage =
				err instanceof ApiError && err.code?.startsWith("github_")
					? "GitHub sync needs a fresh connection. Your local commits are safe."
					: err instanceof Error
						? err.message
						: "Sync failed";
			setSaveError(nextMessage);
			setStatus("Offline sync paused");
		} finally {
			setSyncingOffline(false);
		}
	}, [workspaceId, projectId, offlineCommits, syncingOffline, currentDraftKey, currentNotesDraftKey, currentStateDraftKey, mutateSketch]);

	const handleForkClick = useCallback(() => {
		if (!auth?.authenticated) {
			void appRef.current.redirectToSignIn();
			return;
		}
		setShowForkModal(true);
	}, [auth]);

	const handleForkSubmit = useCallback(async () => {
		if (!targetWorkspaceId || !targetProjectSlug || forking) return;

		setForking(true);
		setForkError(null);

		try {
			const response = await fetch(`/api/workspaces/${encodeURIComponent(targetWorkspaceId)}/projects`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					mode: "fork",
					sourceWorkspaceId: workspaceId,
					sourceProjectId: projectId,
					targetProjectId: targetProjectSlug,
				}),
			});

			if (!response.ok) {
				const errBody = (await response.json().catch(() => ({}))) as any;
				throw new Error(errBody.error?.message || "Failed to fork project");
			}

			const resJson = await response.json();
			setShowForkModal(false);
			
			// Redirect to target forked project editor page
			window.location.href = `/app/workspaces/${encodeURIComponent(targetWorkspaceId)}/projects/${encodeURIComponent(targetProjectSlug)}/sketches/${encodeURIComponent(sketchId)}`;
		} catch (err) {
			console.error("Fork failed:", err);
			setForkError(err instanceof Error ? err.message : "Cloning project failed.");
		} finally {
			setForking(false);
		}
	}, [targetWorkspaceId, targetProjectSlug, forking, workspaceId, projectId, sketchId]);

	useEffect(() => {
		if (workspacesData?.workspaces && workspacesData.workspaces.length > 0 && !targetWorkspaceId) {
			setTargetWorkspaceId(workspacesData.workspaces[0].id);
		}
	}, [workspacesData, targetWorkspaceId]);

	const projectRecord = data?.project && typeof data.project === "object" ? (data.project as { title?: unknown; updatedAt?: unknown }) : null;
	const title =
		typeof projectRecord?.title === "string" && projectRecord.title.trim() ? projectRecord.title.trim() : humanizeSlug(projectId);
	const revisedAt = typeof projectRecord?.updatedAt === "string" ? new Date(projectRecord.updatedAt) : null;
	const revisedLabel =
		revisedAt && !Number.isNaN(revisedAt.getTime())
			? revisedAt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
			: null;
	const subtitle = data
		? `${data.workspace.repoOwner}/${data.workspace.repoName} · projects/${projectId}`
		: workspace
			? `${workspace.repoOwner}/${workspace.repoName} · projects/${projectId} (Offline)`
			: "GitHub-backed visual doc";
	const loading = authLoading;
	const error = loadError || (sketchError instanceof Error ? sketchError.message : null);
	const dirty = sceneDirty || notesDirty;
	const panelLayout = mode === "libraries" || mode === "history" || mode === "source-control"
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
					<div className="absolute inset-0 z-30 grid place-items-center bg-background/70">
						<Loader2 className="size-5 animate-spin text-muted-foreground" />
					</div>
				) : null}
				<div className="absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-md border border-grid/50 bg-grid-tint py-1 pr-1 pl-3 text-xs font-medium text-foreground">
					<span>
						Previewing <span className="datum">{selectedPreviewSha.slice(0, 7)}</span>, read-only
					</span>
					<Button variant="outline" size="xs" onClick={() => setSelectedPreviewSha(null)}>
						Back to current
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
			<div className="grid h-full place-items-center text-sm text-muted-foreground">
				<div className="flex items-center gap-2">
					<Loader2 className="size-4 animate-spin" />
					Loading that version
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
					setExcalidrawApi(api);
					if (api) {
						const isDark = (resolvedTheme ?? "dark") === "dark";
						const targetBg = isDark ? "#000000" : "#ffffff";
						const targetStroke = isDark ? "#ffffff" : "#1e1e1e";
						const appState = api.getAppState();
						const currentBg = (appState.viewBackgroundColor || "").trim().toLowerCase();
						const isDefaultOrNeutralBg =
							!currentBg ||
							currentBg === "#ffffff" ||
							currentBg === "#fff" ||
							currentBg === "#121212" ||
							currentBg === "#1a1a1a" ||
							currentBg === "#000000" ||
							currentBg === "#000" ||
							currentBg === "#f8f9fa" ||
							currentBg === "transparent";
						if (isDefaultOrNeutralBg && (currentBg !== targetBg || appState.currentItemStrokeColor !== targetStroke)) {
							const currentElements = api.getSceneElements();
							const updatedElements = ensureVisibleStrokeColors(currentElements, isDark);
							api.updateScene({
								elements: updatedElements,
								appState: {
									viewBackgroundColor: targetBg,
									currentItemStrokeColor: targetStroke,
								},
							});
							api.refresh();
						}
					}
				}}
				theme={(resolvedTheme ?? "dark") === "dark" ? "dark" : "light"}
				viewModeEnabled={!isOwner}
				UIOptions={{
					tools: {
						image: isOwner,
					},
				}}
			/>
		</div>
	) : null;
	const docsPanel = selectedPreviewSha ? (
		<div className="flex h-full min-h-0 flex-col border-l border-border bg-card">
			<PanelHeader title="Notes" detail={`as of ${selectedPreviewSha.slice(0, 7)}, read-only`} />
			<div className="min-h-0 flex-1 overflow-y-auto p-4">
				<pre className="datum whitespace-pre-wrap text-foreground">
					{snapshotData?.notes || "This version has no notes."}
				</pre>
			</div>
		</div>
	) : (
		<div className="flex h-full min-h-0 flex-col border-l border-border bg-card">
			<PanelHeader title="Notes" detail={notesFilePath(projectId)}>
				{notesDirty ? <StateMark state="draft" label="Unsaved" /> : null}
			</PanelHeader>
			<ProjectDocEditor
				documentKey={currentNotesDraftKey}
				markdown={notes}
				onMarkdownChange={handleNotesChange}
				readOnly={!isOwner}
			/>
		</div>
	);

	const changedFiles = [
		...(sceneDirty ? [`projects/${projectId}/sketches/${sketchId}.excalidraw.json`] : []),
		...(notesDirty ? [`projects/${projectId}/docs/notes.md`] : []),
	];

	const sourceControlPanel = (
		<div className="flex h-full min-h-0 flex-col border-l border-border bg-card">
			<PanelHeader
				title="Commits"
				detail={`${activeWorkspace?.repoOwner ?? ""}/${activeWorkspace?.repoName ?? ""}`}
				onClose={() => setEditorMode(lastPrimaryModeRef.current)}
			>
				<span className="text-xs text-muted-foreground">{isOnline ? "Online" : "Offline"}</span>
			</PanelHeader>

			<div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">
				<form
					className="space-y-2"
					onSubmit={(event) => {
						event.preventDefault();
						void handleOfflineCommit();
					}}
				>
					<label htmlFor="commit-message" className="legend-label block">Commit message</label>
					<textarea
						id="commit-message"
						className="h-16 w-full resize-none rounded-md border border-input bg-card px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-grid"
						placeholder="What changed in this version"
						value={commitMessage}
						onChange={(e) => setCommitMessage(e.target.value)}
					/>
					<Button type="submit" disabled={changedFiles.length === 0 || !commitMessage.trim()} size="sm" className="w-full">
						Queue commit
					</Button>
					<p className="text-xs text-muted-foreground">
						Queued commits stay in this browser until you push them. Use Save in the top bar to commit straight
						to GitHub instead.
					</p>
				</form>

				<section aria-labelledby="changed-files-heading">
					<h3 id="changed-files-heading" className="legend-label flex justify-between">
						<span>Changed files</span>
						<span>{changedFiles.length}</span>
					</h3>
					{changedFiles.length > 0 ? (
						<ul className="mt-1.5 overflow-hidden rounded-md border border-rule">
							{changedFiles.map((file) => (
								<li key={file} className="flex items-center gap-2 border-b border-rule px-2.5 py-1.5 last:border-b-0">
									<StateGlyph state="draft" />
									<span className="datum min-w-0 truncate" title={file}>{file}</span>
								</li>
							))}
						</ul>
					) : (
						<p className="mt-1.5 text-[0.8125rem] text-muted-foreground">Nothing has changed since the last save.</p>
					)}
				</section>

				<section aria-labelledby="queued-commits-heading">
					<div className="flex items-center justify-between gap-2">
						<h3 id="queued-commits-heading" className="legend-label">
							Waiting to push · {offlineCommits.length}
						</h3>
						{offlineCommits.length > 0 && isOnline ? (
							<Button size="xs" onClick={handleSyncOfflineCommits} disabled={syncingOffline}>
								{syncingOffline ? <Loader2 className="animate-spin" /> : <GitBranch />}
								Push {offlineCommits.length}
							</Button>
						) : null}
					</div>
					{offlineCommits.length > 0 ? (
						<ol className="mt-1.5 overflow-hidden rounded-md border border-rule">
							{offlineCommits.map((commit) => (
								<li key={commit.id} className="border-b border-rule px-2.5 py-2 last:border-b-0">
									<div className="truncate text-sm font-medium text-foreground">{commit.message}</div>
									<div className="mt-0.5 flex justify-between gap-2 text-xs text-muted-foreground">
										<span className="truncate">{commit.author}</span>
										<span className="shrink-0">{new Date(commit.timestamp).toLocaleTimeString()}</span>
									</div>
								</li>
							))}
						</ol>
					) : (
						<p className="mt-1.5 text-[0.8125rem] text-muted-foreground">No commits are waiting.</p>
					)}
				</section>
			</div>
		</div>
	);
	const libraryPanel = (
		<ExcalidrawLibraryPanel
			installedSources={installedLibrarySources}
			installingSource={installingLibrarySource}
			onInstall={handleInstallLibrary}
			onClose={() => setEditorMode(lastPrimaryModeRef.current)}
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
			onClose={() => setEditorMode(lastPrimaryModeRef.current)}
		/>
	);

	const viewModes = [
		{ id: "canvas", label: "Canvas", icon: Maximize2 },
		{ id: "split", label: "Split", icon: PanelsTopLeft },
		{ id: "docs", label: "Notes", icon: FileText },
	] as const;
	const repoName = data?.workspace?.repoName ?? workspace?.repoName ?? "Workspace";
	const workState = dirty ? "draft" : !data || status.includes("Offline") ? "local" : "synced";

	return (
		<main className="relative flex h-screen min-h-screen flex-col bg-background">
			{isResizing && <div className="fixed inset-0 z-50 cursor-col-resize select-none" />}

			<header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border bg-lowland px-2 sm:px-3">
				<div className="flex min-w-0 items-center gap-1">
					<Button variant="ghost" size="icon-sm" asChild>
						<Link href={`/app?workspace=${workspaceId}`} aria-label="Back to projects" title="Back to projects">
							<ArrowLeft />
						</Link>
					</Button>
					<nav aria-label="Location" className="flex min-w-0 items-baseline gap-1.5 text-sm">
						<Link
							href={`/app?workspace=${workspaceId}`}
							className="datum hidden max-w-40 truncate rounded-sm text-muted-foreground hover:text-foreground md:inline"
						>
							{repoName}
						</Link>
						<span className="hidden text-muted-foreground/60 md:inline" aria-hidden="true">/</span>
						<button
							type="button"
							aria-expanded={sheetInfoOpen}
							aria-controls="sheet-title-block"
							onClick={() => setSheetInfoOpen((open) => !open)}
							title="Where this project lives"
							className="inline-flex max-w-56 cursor-pointer items-center gap-1 rounded-sm font-semibold text-foreground hover:text-primary"
						>
							<span className="truncate">{title}</span>
							<ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground", sheetInfoOpen && "rotate-180")} />
						</button>
					</nav>
				</div>

				<div role="group" aria-label="Layout" className="flex items-center rounded-md border border-input bg-card p-0.5">
					{viewModes.map((view) => (
						<button
							key={view.id}
							type="button"
							onClick={() => setEditorMode(view.id)}
							aria-pressed={mode === view.id}
							title={view.label}
							className={cn(
								"inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-sm px-2 text-xs font-medium text-muted-foreground hover:text-foreground",
								mode === view.id && "bg-grid-tint font-semibold text-foreground",
							)}
						>
							<view.icon className="size-3.5" />
							<span className="hidden md:inline">{view.label}</span>
						</button>
					))}
				</div>

				<div className="flex min-w-0 items-center gap-1">
					<PanelToggle label="Libraries" icon={BookOpen} active={mode === "libraries"} onClick={() => toggleDrawer("libraries")} />
					<PanelToggle label="History" icon={Clock} active={mode === "history"} onClick={() => toggleDrawer("history")} />
					{isOwner ? (
						<PanelToggle
							label="Commits"
							icon={GitBranch}
							active={mode === "source-control"}
							onClick={() => toggleDrawer("source-control")}
						/>
					) : null}

					<span className="mx-1 hidden h-4 w-px bg-input sm:block" aria-hidden="true" />

					<span className="hidden px-1 sm:inline-flex" aria-live="polite">
						{saving ? (
							<span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
								<Loader2 className="size-3 animate-spin" />
								Saving
							</span>
						) : initialData ? (
							<StateMark state={workState} label={workState === "local" ? "In this browser" : undefined} />
						) : null}
					</span>

					<ThemeToggle />

					{isOwner ? (
						<Button
							disabled={!hasScene || saving || (!dirty && !!data)}
							onClick={() => void handleManualSave()}
							size="sm"
							title="Commit the sketch and notes to GitHub"
						>
							{saving ? <Loader2 className="animate-spin" /> : <Save />}
							Save
						</Button>
					) : (
						<Button onClick={handleForkClick} size="sm" title="Copy this project into one of your workspaces">
							<GitFork />
							Fork
						</Button>
					)}
				</div>
			</header>

			{sheetInfoOpen ? (
				<div
					id="sheet-title-block"
					className="absolute top-12 left-2 z-30 w-[min(26rem,calc(100%-1rem))] rounded-lg border border-rule bg-card p-2 shadow-(--float-shadow) sm:left-3"
				>
					<TitleBlock>
						<TitleBlockRow label="Repository" mono>
							{activeWorkspace ? `${activeWorkspace.repoOwner}/${activeWorkspace.repoName}` : "Not connected"}
						</TitleBlockRow>
						<TitleBlockRow label="Folder" mono>projects/{projectId}</TitleBlockRow>
						<TitleBlockRow label="Branch" mono>
							{activeWorkspace ? `${activeWorkspace.defaultBranch} @ ${shortSha(activeWorkspace.latestCommitSha)}` : "Unknown"}
						</TitleBlockRow>
						{revisedLabel ? <TitleBlockRow label="Revised">{revisedLabel}</TitleBlockRow> : null}
						<TitleBlockRow label="State">
							<StateMark state={workState} />
						</TitleBlockRow>
					</TitleBlock>
					<p className="legend-label mt-2.5 px-0.5">Save writes, in this folder</p>
					<ul className="mt-1 space-y-0.5 px-0.5 pb-0.5">
						{[sketchFilePath(projectId, sketchId), notesFilePath(projectId), projectFilePath(projectId)].map((file) => (
							<li key={file} className="datum truncate text-muted-foreground" title={file}>
								{file.replace(`projects/${projectId}/`, "")}
							</li>
						))}
					</ul>
				</div>
			) : null}

			<section className="min-h-0 flex-1 bg-background">
				{authLoading ? (
					<div className="grid h-full place-items-center text-sm text-muted-foreground">
						<div className="flex items-center gap-2">
							<Loader2 className="size-4 animate-spin" />
							Opening project
						</div>
					</div>
				) : !initialData && !error ? (
					<div className="grid h-full place-items-center text-sm text-muted-foreground">
						<div className="flex items-center gap-2">
							<Loader2 className="size-4 animate-spin" />
							Opening project
						</div>
					</div>
				) : error && !initialData ? (
					<div className="grid h-full place-items-center p-6">
						<div className="max-w-md rounded-lg border border-rule bg-card p-5">
							<h2 className="text-base font-bold">This project could not be opened</h2>
							<p className="mt-1.5 text-sm text-muted-foreground">{error}</p>
							<Button variant="outline" size="sm" className="mt-4" asChild>
								<Link href="/app">Back to projects</Link>
							</Button>
						</div>
					</div>
				) : initialData ? (
					<div className="relative h-full min-h-0 overflow-hidden">
						{conflict ? (
							<div
								role="alertdialog"
								aria-labelledby="conflict-title"
								aria-describedby="conflict-body"
								className="absolute top-3 left-1/2 z-20 w-[min(560px,calc(100%-1.5rem))] -translate-x-1/2 rounded-lg border border-contour/50 bg-card p-4 text-sm shadow-(--float-shadow)"
							>
								<h2 id="conflict-title" className="flex items-center gap-2 font-bold text-foreground">
									<StateGlyph state="draft" />
									This project changed on GitHub since you opened it
								</h2>
								<p id="conflict-body" className="mt-1.5 text-muted-foreground">
									Nothing was saved, and your changes are still in this browser. Choose which version becomes the
									latest. Either way the other one is not lost: the GitHub version stays in History, and you can
									download yours first.
								</p>
								<div className="mt-3 flex flex-wrap items-center gap-2">
									<Button size="sm" disabled={saving} onClick={() => void handleManualSave({ overwrite: true })}>
										{saving ? <Loader2 className="animate-spin" /> : null}
										Keep my version
									</Button>
									<Button variant="outline" size="sm" disabled={saving} onClick={() => void useGithubVersion()}>
										Use the GitHub version
									</Button>
									<Button variant="ghost" size="sm" onClick={downloadMyVersion}>
										<Download />
										Download mine
									</Button>
									<Button variant="ghost" size="sm" className="ml-auto" onClick={() => setConflict(false)}>
										Decide later
									</Button>
								</div>
							</div>
						) : null}
						{saveError ? (
							<div
								role="alert"
								className="absolute top-3 left-1/2 z-20 w-[min(520px,calc(100%-1.5rem))] -translate-x-1/2 rounded-lg border border-contour/50 bg-card p-3 text-sm shadow-(--float-shadow)"
							>
								<div className="flex items-start justify-between gap-3">
									<div>
										<h2 className="font-bold text-foreground">Not saved to GitHub</h2>
										<p className="mt-0.5 text-muted-foreground">
											{saveError} Your changes are still in this browser.
										</p>
									</div>
									<Button variant="ghost" size="icon-xs" onClick={() => setSaveError(null)} aria-label="Dismiss">
										<X />
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
							<div className="mx-auto h-full min-h-0 max-w-4xl">{docsPanel}</div>
						) : (
							<div ref={containerRef} className="relative flex h-full min-h-0 w-full select-none">
								<div
									style={{ width: `${mode === "split" ? splitPanelSizes[0] : sidePanelSizes[0]}%` }}
									className="h-full min-h-0 overflow-hidden"
								>
									{canvasEditor}
								</div>

								<div
									role="separator"
									aria-orientation="vertical"
									aria-label="Resize panels"
									onMouseDown={handleMouseDown}
									className="relative z-10 w-px cursor-col-resize bg-border after:absolute after:inset-y-0 after:-left-1 after:w-2 hover:bg-grid"
								/>

								<div
									style={{ width: `${mode === "split" ? splitPanelSizes[1] : sidePanelSizes[1]}%` }}
									className="h-full min-h-0 overflow-hidden"
								>
									{mode === "libraries" ? libraryPanel : mode === "history" ? historyPanel : mode === "source-control" ? sourceControlPanel : docsPanel}
								</div>
							</div>
						)}
					</div>
				) : null}
			</section>

			<Dialog open={showForkModal} onOpenChange={setShowForkModal}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Fork this project</DialogTitle>
						<DialogDescription>
							Copies the sketch and notes into one of your workspaces as a new commit. The original is not changed.
						</DialogDescription>
					</DialogHeader>
					<form
						className="space-y-4"
						onSubmit={(event) => {
							event.preventDefault();
							void handleForkSubmit();
						}}
					>
						<div>
							<label htmlFor="fork-workspace" className="legend-label mb-1 block">Destination workspace</label>
							<select
								id="fork-workspace"
								className="datum h-9 w-full rounded-md border border-input bg-card px-2.5 outline-none focus-visible:border-grid"
								value={targetWorkspaceId}
								onChange={(e) => setTargetWorkspaceId(e.target.value)}
							>
								<option value="">Choose a workspace</option>
								{workspacesData?.workspaces?.map((ws) => (
									<option key={ws.id} value={ws.id}>
										{ws.repoOwner}/{ws.repoName} ({ws.visibility})
									</option>
								))}
							</select>
						</div>
						<div>
							<label htmlFor="fork-slug" className="legend-label mb-1 block">Folder name</label>
							<Input
								id="fork-slug"
								className="datum"
								value={targetProjectSlug}
								onChange={(e) => setTargetProjectSlug(slugify(e.target.value))}
								placeholder="system-map"
								autoComplete="off"
								spellCheck={false}
							/>
							<p className="mt-1 text-xs text-muted-foreground">
								Saved to <span className="datum">projects/{targetProjectSlug || "folder-name"}</span>.
							</p>
						</div>
						{forkError ? (
							<p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
								{forkError}
							</p>
						) : null}
						<DialogFooter>
							<Button type="button" variant="ghost" size="sm" onClick={() => setShowForkModal(false)}>
								Cancel
							</Button>
							<Button type="submit" size="sm" disabled={forking || !targetWorkspaceId || !targetProjectSlug}>
								{forking ? <Loader2 className="animate-spin" /> : <GitFork />}
								Fork project
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</main>
	);
}

function PanelHeader({
	title,
	detail,
	onClose,
	children,
}: {
	title: string;
	detail?: string;
	onClose?: () => void;
	children?: React.ReactNode;
}) {
	return (
		<div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
			<div className="flex min-w-0 items-baseline gap-2">
				<h2 className="text-sm font-bold text-foreground">{title}</h2>
				{detail ? <span className="datum truncate text-muted-foreground">{detail}</span> : null}
			</div>
			<div className="flex shrink-0 items-center gap-2">
				{children}
				{onClose ? (
					<Button variant="ghost" size="icon-xs" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}>
						<X />
					</Button>
				) : null}
			</div>
		</div>
	);
}

function PanelToggle({
	label,
	icon: Icon,
	active,
	onClick,
}: {
	label: string;
	icon: React.ComponentType<{ className?: string }>;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={active}
			title={label}
			className={cn(
				"inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground",
				active && "bg-grid-tint font-semibold text-foreground",
			)}
		>
			<Icon className="size-3.5" />
			<span className="hidden xl:inline">{label}</span>
		</button>
	);
}
