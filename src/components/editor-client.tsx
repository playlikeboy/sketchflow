"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useStackApp } from "@stackframe/stack";
import type { AppState, BinaryFiles, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import {
  Bot,
  Clock3,
  FileText,
  GitBranch,
  Globe,
  Image,
  Loader2,
  PanelRight,
  Save,
  Share2,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

  return {
    ...base,
    schemaVersion: 1,
    id: projectId,
    title: "First Project",
    updatedAt: now,
    visibility: "private",
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
        setSource(localDraft?.value?.scene ? "local" : "github");
        setStatus(
          localDraft?.value?.scene
            ? `Restored local draft from ${new Date(localDraft.value.updatedAt).toLocaleString()}`
            : "Loaded from GitHub"
        );
      } catch (loadError) {
        if (!mounted) return;
        setError(
          loadError instanceof Error ? loadError.message : "Could not load sketch"
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
          : "Could not commit sketch to GitHub"
      );
      setStatus("Save failed");
    } finally {
      setSaving(false);
    }
  }

  const initialData = useMemo(() => (scene ? toInitialData(scene) : null), [scene]);
  const title = humanizeSlug(sketchId);
  const subtitle = data
    ? `${data.workspace.repoOwner}/${data.workspace.repoName} · projects/${projectId}`
    : "GitHub-backed Excalidraw scene";

  return (
    <AppShell
      title={title}
      subtitle={subtitle}
      syncLabel={
        dirty ? "Local draft" : `Synced ${shortSha(data?.workspace.latestCommitSha)}`
      }
      action={
        <Button
          disabled={!scene || saving}
          onClick={handleManualSave}
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Save
        </Button>
      }
    >
      <div className="grid h-[calc(100vh-96px)] min-h-[620px] gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Canvas */}
        <section className="overflow-hidden rounded-xl border bg-card">
          {/* Status bar */}
          <div className="flex h-10 items-center justify-between border-b px-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <GitBranch className="size-3.5" />
              <span>{status}</span>
            </div>
            <Badge variant="ghost" className="text-xs font-normal">
              {source === "local" ? "IndexedDB draft" : "GitHub snapshot"}
            </Badge>
          </div>

          {loading ? (
            <div className="grid h-[calc(100%-40px)] place-items-center text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Loading scene
              </div>
            </div>
          ) : error ? (
            <div className="grid h-[calc(100%-40px)] place-items-center p-6">
              <div className="max-w-md rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                {error}
              </div>
            </div>
          ) : initialData ? (
            <div className="h-[calc(100%-40px)]">
              <Excalidraw initialData={initialData} onChange={handleChange} />
            </div>
          ) : null}
        </section>

        {/* Metadata sidebar */}
        <aside className="hidden space-y-3 overflow-auto xl:block">
          <Card size="sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Sketch metadata</CardTitle>
                <PanelRight className="size-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="rounded-lg border bg-background px-3 py-2">
                <div className="text-xs text-muted-foreground">Scene path</div>
                <div className="break-all font-mono text-xs">
                  {sketchFilePath(projectId, sketchId)}
                </div>
              </div>
              <div className="rounded-lg border bg-background px-3 py-2">
                <div className="text-xs text-muted-foreground">Elements</div>
                <div>{scene?.elements.length ?? 0}</div>
              </div>
              <div className="rounded-lg border bg-background px-3 py-2">
                <div className="text-xs text-muted-foreground">Latest commit</div>
                <div>{shortSha(data?.workspace.latestCommitSha)}</div>
              </div>
            </CardContent>
          </Card>

          {[
            {
              label: "Version timeline",
              icon: Clock3,
              detail: "Visual commit history will live here.",
            },
            {
              label: "Exports",
              icon: Image,
              detail: "SVG, PNG, WebP, and CDN paths are planned.",
            },
            {
              label: "Docs",
              icon: FileText,
              detail: "Repo-backed Markdown notes beside sketches.",
            },
            {
              label: "Public sharing",
              icon: Globe,
              detail: "Publish read-only pages from pinned commits.",
            },
            {
              label: "AI assistant",
              icon: Bot,
              detail: "BYOK and GitHub Models providers later.",
            },
            {
              label: "Collaboration",
              icon: Users,
              detail: "Yjs rooms and Redis presence after MVP.",
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.label} size="sm" className="opacity-75">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Icon className="size-4" />
                    <CardTitle>{item.label}</CardTitle>
                  </div>
                  <CardDescription>{item.detail}</CardDescription>
                </CardHeader>
              </Card>
            );
          })}

          <Button variant="outline" className="w-full" asChild>
            <Link href="/app">
              <Share2 className="size-4" />
              Back to dashboard
            </Link>
          </Button>
        </aside>
      </div>
    </AppShell>
  );
}
