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
import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { commitWorkspaceFiles, getAuthMe, getSketch, type SketchLoadResponse, type SketchScene } from "@/lib/api";
import { getDraft, setDraft } from "@/lib/indexeddb";
import { draftKey, humanizeSlug, normalizeScene, notesFilePath, projectFilePath, sketchFilePath } from "@/lib/sketchflow";

const Excalidraw = dynamic(async () => (await import("@excalidraw/excalidraw")).Excalidraw, {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center bg-background text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <Loader2 className="size-4 animate-spin" />
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

function buildProjectFile(projectId: string, existingProject: unknown) {
  const now = new Date().toISOString();
  const base = existingProject && typeof existingProject === "object" ? existingProject : {};

  const existingVisibility =
    "visibility" in base && (base as { visibility?: unknown }).visibility === "private"
      ? "private"
      : "public";

  return {
    ...base,
    schemaVersion: 1,
    id: projectId,
    title: humanizeSlug(projectId),
    updatedAt: now,
    visibility: existingVisibility,
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

  const [data, setData] = useState<SketchLoadResponse | null>(null);
  const [scene, setScene] = useState<SketchScene | null>(null);
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null);
  const [source, setSource] = useState<"github" | "local">("github");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("Loading sketch");
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentDraftKey = useMemo(
    () => draftKey(workspaceId, projectId, sketchId),
    [workspaceId, projectId, sketchId]
  );

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        const auth = await getAuthMe();
        if (!auth.authenticated) {
          await app.redirectToSignIn();
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
        setScene(nextScene);
        setInitialData(toInitialData(nextScene));
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
  }, [app, currentDraftKey, projectId, sketchId, workspaceId]);

  function queueDraftSave(nextScene: SketchScene) {
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
  }

  function handleChange(elements: readonly unknown[], appState: AppState, files: BinaryFiles) {
    const nextScene = normalizeScene({
      ...(scene ?? {}),
      elements: [...elements],
      appState: cleanAppState(appState),
      files,
    });

    setScene(nextScene);
    setDirty(true);
    setSource("local");
    queueDraftSave(nextScene);
  }

  async function handleManualSave() {
    if (!scene || !data) return;

    setSaving(true);
    setError(null);
    setStatus("Committing to GitHub");

    try {
      const project = buildProjectFile(projectId, data.project);
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
        ],
      });

      setData({
        ...data,
        workspace: {
          ...data.workspace,
          latestCommitSha: response.commit.sha,
        },
      });
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
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-background px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href="/app" aria-label="Back to dashboard">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold sm:text-base">{title}</h1>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">{subtitle}</p>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <Badge variant="secondary" className="hidden gap-1.5 font-normal md:inline-flex">
            <GitBranch className="size-3" />
            {dirty ? "Local draft" : `Synced ${shortSha(data?.workspace.latestCommitSha)}`}
          </Badge>
          <Badge variant="outline" className="hidden font-normal lg:inline-flex">
            {source === "local" ? "Autosaved locally" : status}
          </Badge>
          <Button disabled={!scene || saving} onClick={handleManualSave}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save
          </Button>
        </div>
      </header>

      <section className="min-h-0 flex-1 bg-card">
        {loading ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              Opening canvas
            </div>
          </div>
        ) : error ? (
          <div className="grid h-full place-items-center p-6">
            <div className="max-w-md rounded-lg border bg-background p-4 text-sm text-muted-foreground">
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
