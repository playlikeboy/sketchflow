"use client";

import dynamic from "next/dynamic";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { useTheme } from "next-themes";
import type { SketchScene } from "@/lib/api";
import { normalizeScene } from "@/lib/sketchflow";

const Excalidraw = dynamic(async () => (await import("@excalidraw/excalidraw")).Excalidraw, {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-sm font-bold text-muted-foreground">
      <div className="flex items-center gap-2">
        <Loader2 className="size-4 animate-spin text-[#58CC02]" />
        Loading canvas
      </div>
    </div>
  ),
});

function toInitialData(scene: SketchScene, resolvedTheme?: string): ExcalidrawInitialDataState {
  return {
    elements: scene.elements as ExcalidrawInitialDataState["elements"],
    appState: {
      ...scene.appState,
      viewBackgroundColor: resolvedTheme === "dark" && (scene.appState?.viewBackgroundColor === "#ffffff" || !scene.appState?.viewBackgroundColor)
        ? "#121212"
        : scene.appState?.viewBackgroundColor ?? "#ffffff",
    } as ExcalidrawInitialDataState["appState"],
    files: scene.files as ExcalidrawInitialDataState["files"],
  };
}

export function PublicSketchViewer({ scene }: { scene: Partial<SketchScene> | null }) {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const normalized = normalizeScene(scene);
  const initialData = toInitialData(normalized, resolvedTheme);

  if (!mounted) {
    return (
      <div className="grid h-full min-h-[420px] place-items-center text-sm font-bold text-muted-foreground border-2 border-border rounded-[16px] bg-card">
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin text-[#58CC02]" />
          Loading canvas
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-[420px] overflow-hidden rounded-[16px] border-2 border-border bg-card shadow-[0_2px_0_var(--border)]">
      <Excalidraw 
        initialData={initialData} 
        viewModeEnabled 
        theme={resolvedTheme === "dark" ? "dark" : "light"}
      />
    </div>
  );
}

