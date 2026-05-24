"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useStackApp } from "@stackframe/stack";
import type { AppState, BinaryFiles, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import {
  ArrowLeft,
  GitBranch,
  Loader2,
  Save,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { commitWorkspaceFiles, getAuthMe, getSketch, type SketchLoadResponse, type SketchScene } from "@/lib/api";
import { getDraft, setDraft } from "@/lib/indexeddb";
import { PROJECTS_METADATA_PATH, mergeProjectsMetadata, projectFromProjectJson } from "@/lib/project-metadata";
import { draftKey, humanizeSlug, normalizeScene, notesFilePath, projectFilePath, sketchFilePath } from "@/lib/sketchflow";

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

  const [data, setData] = useState<SketchLoadResponse | null>(null);
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null);
  const [source, setSource] = useState<"github" | "local">("github");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [hasScene, setHasScene] = useState(false);
  const [status, setStatus] = useState("Loading sketch");
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sceneRef = useRef<SketchScene | null>(null);
  const dirtyRef = useRef(false);
  const sourceRef = useRef<"github" | "local">("github");
  const currentDraftKey = useMemo(
    () => draftKey(workspaceId, projectId, sketchId),
    [workspaceId, projectId, sketchId]
  );

  useEffect(() => {
    appRef.current = app;
  }, [app]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    setInitialData(null);
    setHasScene(false);
    sceneRef.current = null;
    dirtyRef.current = false;

    async function load() {
      try {
        const auth = await getAuthMe();
        if (!auth.authenticated) {
          await appRef.current.redirectToSignIn();
          return;
        }

        const response = await getSketch({ workspaceId, projectId, sketchId });
        const githubScene = normalizeScene(response.sketch);
        const localDraft = await getDraft<DraftValue>(currentDraftKey);
        const nextScene = localDraft?.value?.scene
          ? normalizeScene(localDraft.value.scene)
          : githubScene;

        if (!mounted) return;

        setData(response);
        sceneRef.current = nextScene;
        dirtyRef.current = false;
        sourceRef.current = localDraft?.value?.scene ? "local" : "github";
        setInitialData(toInitialData(nextScene));
        setHasScene(true);
        setDirty(false);
        setSource(localDraft?.value?.scene ? "local" : "github");
        setStatus(
          localDraft?.value?.scene
            ? `Restored local draft from ${new Date(localDraft.value.updatedAt).toLocaleString()}`
            : "Loaded from GitHub"
        );
      } catch (loadError) {
        if (!mounted) return;
        setError(
          loadError instanceof Error ? loadError.message : "Sketch could not be opened"
        );
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();

    return () => {
      mounted = false;
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
  }, [currentDraftKey, projectId, sketchId, workspaceId]);

  const queueDraftSave = useCallback((nextScene: SketchScene) => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }

    saveTimer.current = setTimeout(() => {
      void setDraft<DraftValue>(currentDraftKey, {
        scene: nextScene,
        updatedAt: new Date().toISOString(),
      }).then((record) => {
        if (record) {
          setStatus(
            `Local draft saved ${new Date(record.updatedAt).toLocaleTimeString()}`
          );
        }
      });
    }, 500);
  }, [currentDraftKey]);

  const handleChange = useCallback((elements: readonly unknown[], appState: AppState, files: BinaryFiles) => {
    const nextScene = normalizeScene({
      ...(sceneRef.current ?? {}),
      elements: [...elements],
      appState: cleanAppState(appState),
      files,
    });

    sceneRef.current = nextScene;

    if (!dirtyRef.current) {
      dirtyRef.current = true;
      setDirty(true);
    }

    if (sourceRef.current !== "local") {
      sourceRef.current = "local";
      setSource("local");
    }

    queueDraftSave(nextScene);
  }, [queueDraftSave]);

  async function handleManualSave() {
    const scene = sceneRef.current;
    if (!scene || !data) return;

    setSaving(true);
    setError(null);
    setStatus("Committing to GitHub");

    try {
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
      const notes =
        data.notes ||
        `# ${humanizeSlug(projectId)}\n\nSketch notes for ${humanizeSlug(sketchId)}.\n`;
      const response = await commitWorkspaceFiles({
        workspaceId,
        message: `Update ${humanizeSlug(sketchId)} sketch`,
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
            content: notes.endsWith("\n") ? notes : `${notes}\n`,
          },
          {
            path: PROJECTS_METADATA_PATH,
            content: `${JSON.stringify(projectMetadata, null, 2)}\n`,
          },
        ],
      });

      setData({
        ...data,
        projectsMetadata: projectMetadata,
        workspace: {
          ...data.workspace,
          latestCommitSha: response.commit.sha,
        },
      });
      dirtyRef.current = false;
      sourceRef.current = "github";
      setDirty(false);
      setSource("github");
      setStatus(`Synced to GitHub · ${shortSha(response.commit.sha)}`);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Sketch was not saved"
      );
      setStatus("Save failed");
    } finally {
      setSaving(false);
    }
  }

  const title = humanizeSlug(sketchId);
  const subtitle = data
    ? `${data.workspace.repoOwner}/${data.workspace.repoName} · projects/${projectId}`
    : "GitHub-backed Excalidraw scene";

  return (
    <main className="flex h-screen min-h-screen flex-col bg-background">
      {/* Decorative gradient bar */}
      <div className="h-1 w-full bg-gradient-to-r from-[#58CC02] via-[#1CB0F6] to-[#CE82FF]" />

      <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b-2 border-border bg-background px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild className="text-muted-foreground hover:text-[#58CC02]">
            <Link href="/app" aria-label="Back to dashboard">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-base font-extrabold tracking-[-0.02em] text-foreground">{title}</h1>
            <p className="hidden truncate text-sm font-semibold text-muted-foreground sm:block">{subtitle}</p>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2">
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
              Opening canvas
            </div>
          </div>
        ) : error ? (
          <div className="grid h-full place-items-center p-6">
            <div className="max-w-md rounded-[16px] border-2 border-border bg-card p-5 text-sm font-bold text-muted-foreground shadow-[0_2px_0_var(--border)]">
              {error}
            </div>
          </div>
        ) : initialData ? (
          <div className="h-full">
            <Excalidraw key={currentDraftKey} initialData={initialData} onChange={handleChange} />
          </div>
        ) : null}
      </section>
    </main>
  );
}
