"use client";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import useSWR from "swr";

import { nearestScroller } from "@/components/editor/insert/libraries/dom";
import { ItemGrid } from "@/components/editor/insert/libraries/item-grid";
import {
	PackLoadError,
	asSceneElements,
	loadPack,
	type LoadedPack,
	type PackItem,
	type PackRef,
} from "@/components/editor/insert/libraries/pack";
import { Button } from "@/components/ui/button";
import { insertElements } from "@/lib/canvas-insert";

const SKELETON_CELLS = Array.from({ length: 12 }, (_, index) => index);

type PackViewProps = {
	api: ExcalidrawImperativeAPI;
	pack: PackRef;
	isDark: boolean;
	/** Move keyboard focus to the back control when the view appears. */
	shouldFocus: boolean;
	onBack: () => void;
	/** The pack was opened successfully or inserted from: keep it in "Your libraries". */
	onUsed: (pack: PackRef) => void;
	onInserted: (label: string) => void;
};

function loadErrorMessage(error: unknown) {
	return error instanceof PackLoadError ? error.message : "This library could not be opened. Try again.";
}

function shapeCount(count: number) {
	return count === 1 ? "1 shape" : `${count} shapes`;
}

/** One opened pack: a way back, its name, and its shapes to click onto the canvas. */
export function PackView({ api, pack, isDark, shouldFocus, onBack, onUsed, onInserted }: PackViewProps) {
	const rootRef = useRef<HTMLDivElement>(null);
	const backRef = useRef<HTMLButtonElement>(null);
	const [insertError, setInsertError] = useState("");
	// Parsed packs stay in SWR's in-memory cache for the rest of the visit.
	const { data, error, isValidating, mutate } = useSWR<LoadedPack>(["excalidraw-library-pack", pack.source], () => loadPack(pack.source), {
		revalidateIfStale: false,
		revalidateOnFocus: false,
		revalidateOnReconnect: false,
		shouldRetryOnError: false,
	});
	const isLoading = !data && isValidating;

	// Before the first paint, so the pack never flashes at the old scroll position.
	useLayoutEffect(() => {
		// The list this view replaced may have been scrolled far down.
		const scroller = rootRef.current ? nearestScroller(rootRef.current) : null;
		if (scroller) scroller.scrollTop = 0;
		if (shouldFocus) backRef.current?.focus();
	}, [shouldFocus]);

	useEffect(() => {
		if (data) onUsed(pack);
	}, [data, onUsed, pack]);

	const handleInsert = useCallback(
		async (item: PackItem) => {
			setInsertError("");
			try {
				const added = await insertElements(api, asSceneElements(item.elements));
				if (added === 0) {
					setInsertError("That shape is empty, so nothing was added.");
					return;
				}
				onInserted(item.name || pack.name);
				onUsed(pack);
			} catch (insertFailure) {
				console.warn("A library shape could not be added to the canvas:", insertFailure);
				setInsertError("That shape could not be added to the canvas. Try again.");
			}
		},
		[api, onInserted, onUsed, pack],
	);

	return (
		<div ref={rootRef}>
			{/* Stays in view while the shapes scroll, so the way back and any error are always visible. */}
			<header className="sticky top-0 z-10 border-b border-rule bg-card px-2 py-2">
				<div className="flex items-center gap-2">
					<Button ref={backRef} variant="ghost" size="icon-xs" onClick={onBack} aria-label="Back to all libraries" title="Back to all libraries">
						<ArrowLeft />
					</Button>
					<div className="min-w-0 flex-1">
						<h3 className="truncate text-sm font-semibold text-foreground">{pack.name}</h3>
						<p className="truncate text-xs text-muted-foreground">
							{[pack.author, data ? shapeCount(data.items.length) : null].filter(Boolean).join(" · ") || "Excalidraw community"}
						</p>
					</div>
				</div>
				{insertError ? (
					<p role="alert" className="mx-1 mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
						{insertError}
					</p>
				) : null}
			</header>

			{isLoading ? (
				<div role="status" className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2 p-3">
					<span className="sr-only">Loading {pack.name}</span>
					{SKELETON_CELLS.map((cell) => (
						<div key={cell} className="aspect-square animate-pulse rounded-md bg-muted" />
					))}
				</div>
			) : error && !data ? (
				<div className="p-3">
					<p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
						{loadErrorMessage(error)}
					</p>
					<div className="mt-2 flex gap-2">
						<Button variant="outline" size="sm" onClick={() => void mutate()}>
							<RefreshCw />
							Try again
						</Button>
						<Button variant="ghost" size="sm" onClick={onBack}>
							Back to libraries
						</Button>
					</div>
				</div>
			) : data && data.items.length === 0 ? (
				<p className="p-4 text-sm text-muted-foreground">This library has no shapes in it.</p>
			) : data ? (
				<ItemGrid items={data.items} packName={pack.name} isDark={isDark} onInsert={handleInsert} />
			) : null}
		</div>
	);
}
