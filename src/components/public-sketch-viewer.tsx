"use client";

import dynamic from "next/dynamic";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { useTheme } from "next-themes";
import type { SketchScene } from "@/lib/api";
import { normalizeScene } from "@/lib/sketchflow";
import { cn } from "@/lib/utils";

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

function ensureVisibleStrokeColors(elements: any[], isDark: boolean): any[] {
  if (!elements || !Array.isArray(elements)) return [];
  return elements.map((el) => {
    if (!el) return el;
    if (el.type === "text" || el.type === "line" || el.type === "arrow" || el.type === "freedraw" || el.type === "rectangle" || el.type === "ellipse" || el.type === "diamond") {
      const stroke = el.strokeColor?.toLowerCase();
      if (isDark) {
        if (stroke === "#000000" || stroke === "#1e1e1e" || !stroke) {
          return { ...el, strokeColor: "#ffffff" };
        }
      } else {
        if (stroke === "#ffffff" || stroke === "#f0f0f0") {
          return { ...el, strokeColor: "#000000" };
        }
      }
    }
    return el;
  });
}

function toInitialData(scene: SketchScene, resolvedTheme?: string): ExcalidrawInitialDataState {
  const isDark = resolvedTheme === "dark";
  const elements = ensureVisibleStrokeColors(scene.elements || [], isDark);
  return {
    elements: elements as ExcalidrawInitialDataState["elements"],
    appState: {
      ...scene.appState,
      viewBackgroundColor: isDark && (scene.appState?.viewBackgroundColor === "#ffffff" || !scene.appState?.viewBackgroundColor)
        ? "#1a1a1a"
        : scene.appState?.viewBackgroundColor ?? "#ffffff",
    } as ExcalidrawInitialDataState["appState"],
    files: scene.files as ExcalidrawInitialDataState["files"],
  };
}

export function PublicSketchViewer({
  scene,
  className = "h-[550px] w-full",
}: {
  scene: Partial<SketchScene> | null;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const normalized = normalizeScene(scene);
  const initialData = toInitialData(normalized, resolvedTheme);

  if (!mounted) {
    return (
      <div className={cn("grid place-items-center text-sm font-bold text-muted-foreground border-2 border-border rounded-[16px] bg-card", className)}>
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin text-[#58CC02]" />
          Loading canvas
        </div>
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-[16px] border-2 border-border bg-card shadow-[0_2px_0_var(--border)]", className)}>
      <Excalidraw 
        initialData={initialData} 
        viewModeEnabled 
        theme={resolvedTheme === "dark" ? "dark" : "light"}
      />
    </div>
  );
}

