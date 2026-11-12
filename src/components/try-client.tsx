"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useStackApp } from "@stackframe/stack";
import type { AppState, BinaryFiles, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import { ArrowLeft, Download, Eraser, FileText, Loader2, Maximize2, PanelsTopLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";

import { ProjectDocEditor } from "@/components/project-doc-editor";
import { toInitialData } from "@/components/public-sketch-viewer";
import { StateMark } from "@/components/state-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import type { SketchScene } from "@/lib/api";
import { setDraft } from "@/lib/indexeddb";
import { normalizeScene } from "@/lib/sketchflow";
import {
	TRY_DRAFT_KEY,
	TRY_NOTES_KEY,
	TRY_SAMPLE_NOTES,
	clearTryDraft,
	readTryDraft,
	type TryNotesDraft,
	type TrySceneDraft,
} from "@/lib/try-draft";
import { cn } from "@/lib/utils";

const Excalidraw = dynamic(async () => (await import("@excalidraw/excalidraw")).Excalidraw, {
	ssr: false,
	loading: () => <CanvasLoading />,
});

function CanvasLoading() {
	return (
		<div className="grid h-full place-items-center text-sm text-muted-foreground">
			<div className="flex items-center gap-2">
				<Loader2 className="size-4 animate-spin" />
				Loading canvas
			</div>
		</div>
	);
}

type Layout = "canvas" | "split" | "notes";

const layouts = [
	{ id: "canvas", label: "Canvas", icon: Maximize2 },
	{ id: "split", label: "Split", icon: PanelsTopLeft },
	{ id: "notes", label: "Notes", icon: FileText },
] as const;

/** Three labelled boxes and two arrows that describe the product, built with Excalidraw's own helper. */
async function buildSampleScene(): Promise<SketchScene> {
	const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
	const elements = convertToExcalidrawElements([
		{ type: "rectangle", id: "sample-draw", x: 60, y: 140, width: 170, height: 70, label: { text: "Draw here" } },
		{ type: "rectangle", id: "sample-write", x: 330, y: 140, width: 190, height: 70, label: { text: "Write beside it" } },
		{ type: "rectangle", id: "sample-save", x: 620, y: 140, width: 210, height: 70, label: { text: "Save to your repo" } },
		{ type: "arrow", id: "sample-arrow-1", x: 240, y: 175, width: 80, height: 0 },
		{ type: "arrow", id: "sample-arrow-2", x: 530, y: 175, width: 80, height: 0 },
	]);

	return normalizeScene({ elements: elements as unknown[], appState: { viewBackgroundColor: "#ffffff" }, files: {} });
}

function download(filename: string, content: string, type: string) {
	const url = URL.createObjectURL(new Blob([content], { type }));
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
}

export function TryClient() {
	const app = useStackApp();
	const { resolvedTheme } = useTheme();
	const [layout, setLayout] = useState<Layout>("split");
	const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null);
	const [canvasKey, setCanvasKey] = useState(0);
	const [notes, setNotes] = useState<string | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const sceneRef = useRef<SketchScene | null>(null);
	const touchedRef = useRef(false);
	const themeRef = useRef<string | undefined>(undefined);
	const sceneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Phones get one pane at a time; the split is for wider screens.
	useEffect(() => {
		if (window.matchMedia("(max-width: 767px)").matches) {
			setLayout("canvas");
		}
	}, []);

	useEffect(() => {
		let active = true;

		async function load() {
			try {
				const draft = await readTryDraft();
				const scene = draft.scene ? normalizeScene(draft.scene) : await buildSampleScene();
				if (!active) return;
				touchedRef.current = draft.touched;
				sceneRef.current = scene;
				setNotes(draft.notes ?? TRY_SAMPLE_NOTES);
			} catch (error) {
				if (active) setLoadError(error instanceof Error ? error.message : "The canvas could not be opened.");
			}
		}

		void load();
		return () => {
			active = false;
		};
	}, []);

	// (Re)mount the canvas with colours adapted to the theme. The latest scene is kept in a ref,
	// so switching theme never loses work.
	useEffect(() => {
		if (!sceneRef.current || !resolvedTheme || notes === null) return;
		if (themeRef.current === resolvedTheme && initialData) return;
		themeRef.current = resolvedTheme;
		setInitialData(toInitialData(sceneRef.current, resolvedTheme));
		setCanvasKey((key) => key + 1);
	}, [resolvedTheme, notes, initialData]);

	const handleSceneChange = useCallback((elements: readonly unknown[], appState: AppState, files: BinaryFiles) => {
		const scene: SketchScene = {
			type: "excalidraw",
			version: 2,
			source: "https://sketchflow.space",
			elements: elements.filter((element) => !(element as { isDeleted?: boolean }).isDeleted),
			appState: { viewBackgroundColor: appState.viewBackgroundColor },
			files: files as Record<string, unknown>,
		};
		sceneRef.current = scene;

		if (sceneTimer.current) clearTimeout(sceneTimer.current);
		sceneTimer.current = setTimeout(() => {
			void setDraft<TrySceneDraft>(TRY_DRAFT_KEY, {
				scene,
				updatedAt: new Date().toISOString(),
				touched: touchedRef.current,
			});
		}, 400);
	}, []);

	const handleNotesChange = useCallback((nextNotes: string) => {
		setNotes(nextNotes);
		if (notesTimer.current) clearTimeout(notesTimer.current);
		notesTimer.current = setTimeout(() => {
			void setDraft<TryNotesDraft>(TRY_NOTES_KEY, { notes: nextNotes, updatedAt: new Date().toISOString() });
		}, 400);
	}, []);

	useEffect(() => {
		return () => {
			if (sceneTimer.current) clearTimeout(sceneTimer.current);
			if (notesTimer.current) clearTimeout(notesTimer.current);
		};
	}, []);

	async function startOver() {
		if (!window.confirm("Clear the canvas and notes? This cannot be undone.")) return;
		await clearTryDraft();
		touchedRef.current = false;
		sceneRef.current = normalizeScene({ elements: [], appState: { viewBackgroundColor: "#ffffff" }, files: {} });
		setNotes("");
		await setDraft<TryNotesDraft>(TRY_NOTES_KEY, { notes: "", updatedAt: new Date().toISOString() });
		setInitialData(toInitialData(sceneRef.current, resolvedTheme));
		setCanvasKey((key) => key + 1);
	}

	function downloadSketch() {
		if (!sceneRef.current) return;
		download("sketch.excalidraw", `${JSON.stringify(sceneRef.current, null, 2)}\n`, "application/json");
	}

	const canvas = initialData ? (
		<div className="h-full min-h-0" onPointerDown={() => (touchedRef.current = true)} onKeyDown={() => (touchedRef.current = true)}>
			<Excalidraw
				key={canvasKey}
				initialData={initialData}
				onChange={handleSceneChange}
				theme={resolvedTheme === "dark" ? "dark" : "light"}
			/>
		</div>
	) : (
		<CanvasLoading />
	);

	const notesPane = (
		<div className="flex h-full min-h-0 flex-col bg-card">
			<div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
				<div className="flex min-w-0 items-baseline gap-2">
					<h2 className="text-sm font-bold text-foreground">Notes</h2>
					<span className="datum truncate text-muted-foreground">notes.md</span>
				</div>
				<Button
					variant="ghost"
					size="xs"
					onClick={() => download("notes.md", notes ?? "", "text/markdown")}
					title="Download the notes as a Markdown file"
				>
					<Download />
					Download
				</Button>
			</div>
			{notes !== null ? (
				<ProjectDocEditor documentKey={TRY_NOTES_KEY} markdown={notes} onMarkdownChange={handleNotesChange} />
			) : null}
		</div>
	);

	return (
		<main className="flex h-screen min-h-screen flex-col bg-background">
			<header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border bg-lowland px-2 sm:px-3">
				<div className="flex min-w-0 items-center gap-1">
					<Button variant="ghost" size="icon-sm" asChild>
						<Link href="/" aria-label="Back to the home page" title="Back to the home page">
							<ArrowLeft />
						</Link>
					</Button>
					<h1 className="truncate text-sm font-semibold text-foreground">Scratch sketch</h1>
					<StateMark state="local" label="In this browser" className="ml-2 hidden sm:inline-flex" />
				</div>

				<div role="group" aria-label="Layout" className="flex items-center rounded-md border border-input bg-card p-0.5">
					{layouts.map((view) => (
						<button
							key={view.id}
							type="button"
							onClick={() => setLayout(view.id)}
							aria-pressed={layout === view.id}
							title={view.label}
							className={cn(
								"h-7 cursor-pointer items-center gap-1.5 rounded-sm px-2 text-xs font-medium text-muted-foreground hover:text-foreground",
								view.id === "split" ? "hidden md:inline-flex" : "inline-flex",
								layout === view.id && "bg-grid-tint font-semibold text-foreground",
							)}
						>
							<view.icon className="size-3.5" />
							<span className="hidden md:inline">{view.label}</span>
						</button>
					))}
				</div>

				<div className="flex min-w-0 items-center gap-1">
					<Button variant="ghost" size="sm" onClick={() => void startOver()} title="Clear the canvas and notes">
						<Eraser />
						<span className="hidden lg:inline">Start over</span>
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="hidden sm:inline-flex"
						onClick={downloadSketch}
						title="Download the sketch as an Excalidraw file"
					>
						<Download />
						<span className="hidden lg:inline">Download</span>
					</Button>
					<ThemeToggle />
					<Button size="sm" onClick={() => void app.redirectToSignUp()} title="Create an account and keep this sketch">
						<span className="sm:hidden">Sign in</span>
						<span className="hidden sm:inline">Sign in to save to GitHub</span>
					</Button>
				</div>
			</header>

			<section className="min-h-0 flex-1">
				{loadError ? (
					<div className="grid h-full place-items-center p-6">
						<div className="max-w-md rounded-lg border border-rule bg-card p-5">
							<h2 className="text-base font-bold">The canvas could not be opened</h2>
							<p className="mt-1.5 text-sm text-muted-foreground">
								{loadError} This page needs browser storage, which private windows sometimes block.
							</p>
						</div>
					</div>
				) : layout === "canvas" ? (
					canvas
				) : layout === "notes" ? (
					<div className="mx-auto h-full min-h-0 max-w-4xl border-x border-border">{notesPane}</div>
				) : (
					<div className="flex h-full min-h-0">
						<div className="h-full min-h-0 min-w-0 flex-[3]">{canvas}</div>
						<div className="h-full min-h-0 min-w-0 flex-[2] border-l border-border">{notesPane}</div>
					</div>
				)}
			</section>

			<p className="shrink-0 border-t border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
				Nothing here leaves your browser. Sign in and Sketchflow offers to turn this sketch into a project in a
				GitHub repository you own.
			</p>
		</main>
	);
}
