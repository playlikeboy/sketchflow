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

function toInitialData(scene: SketchScene, resolvedTheme?: string): ExcalidrawInitialDataState {
  const isDark = (resolvedTheme ?? "dark") === "dark";
  const targetBg = isDark ? "#121212" : "#ffffff";
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
    sceneBg === "#f8f9fa";
  const viewBackgroundColor = isDefaultOrNeutralBg ? targetBg : scene.appState?.viewBackgroundColor ?? targetBg;

  return {
    elements: elements as ExcalidrawInitialDataState["elements"],
    appState: {
      ...scene.appState,
      viewBackgroundColor,
      currentItemStrokeColor: targetStroke,
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

