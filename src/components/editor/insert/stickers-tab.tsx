"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import type { InsertTabProps } from "@/components/editor/insert/types";
import { Button } from "@/components/ui/button";
import { insertImage, svgToImage } from "@/lib/canvas-insert";
import {
	filterStickers,
	groupStickersByCategory,
	STICKER_CATEGORIES,
	STICKERS,
	stickerUrl,
	type Sticker,
	type StickerCategoryId,
} from "@/lib/stickers";
import { MAX_SVG_BYTES, sanitizeSvg } from "@/lib/upload-image";
import { cn } from "@/lib/utils";

/** Longest side of an inserted sticker, in scene units. Smaller than a picture on purpose. */
const STICKER_INSERT_SIZE = 96;
const PREVIEW_SIZE = 32;
/** A sticker is a few kilobytes. Past this the connection is not going to deliver it. */
const LOAD_TIMEOUT_MS = 15_000;

type CategoryFilter = StickerCategoryId | "all";

const CATEGORY_CHIPS: readonly { id: CategoryFilter; label: string }[] = [{ id: "all", label: "All" }, ...STICKER_CATEGORIES];

/** Fetches a sticker's SVG from the pinned CDN copy and cleans it like any other outside file. */
async function loadStickerSvg(sticker: Sticker): Promise<string> {
	const response = await fetch(stickerUrl(sticker.id), { signal: AbortSignal.timeout(LOAD_TIMEOUT_MS) });
	if (!response.ok) {
		throw new Error(`The sticker request failed with status ${response.status}.`);
	}
	const markup = await response.text();
	if (markup.length > MAX_SVG_BYTES) {
		throw new Error("The sticker file is larger than any sticker should be.");
	}
	const cleaned = sanitizeSvg(markup);
	if (!cleaned.ok) {
		throw new Error(cleaned.message);
	}
	return cleaned.svg;
}

function loadErrorMessage(name: string) {
	const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
	return isOffline
		? "You are offline. Stickers need an internet connection."
		: `The ${name} sticker could not be loaded. Check your connection and try again.`;
}

/** Fetches a sticker and adds it to the canvas. Resolves to null, or to a message for the person. */
async function addSticker(api: InsertTabProps["api"], sticker: Sticker): Promise<string | null> {
	let svg: string;
	try {
		svg = await loadStickerSvg(sticker);
	} catch (failure) {
		// The sticker is fetched from the CDN when it is clicked, so this is nearly always the network.
		console.warn("A sticker could not be loaded:", failure);
		return loadErrorMessage(sticker.name);
	}

	try {
		await insertImage(api, { ...svgToImage(svg), targetSize: STICKER_INSERT_SIZE });
		return null;
	} catch (failure) {
		console.warn("A sticker could not be added to the canvas:", failure);
		return `The ${sticker.name} sticker could not be added to the canvas. Try again.`;
	}
}

type StickerButtonProps = {
	sticker: Sticker;
	isBusy: boolean;
	onInsert: (sticker: Sticker) => void;
};

function StickerButton({ sticker, isBusy, onInsert }: StickerButtonProps) {
	const [hasPreviewFailed, setHasPreviewFailed] = useState(false);

	return (
		<button
			type="button"
			aria-label={`Insert ${sticker.name} sticker`}
			aria-busy={isBusy}
			title={sticker.name}
			onClick={() => onInsert(sticker)}
			className={cn(
				"relative grid aspect-square w-full cursor-pointer place-items-center rounded-md border border-transparent hover:border-input hover:bg-accent active:translate-y-px",
				isBusy && "cursor-progress",
			)}
		>
			{hasPreviewFailed ? (
				// The picture could not be loaded, so the device's own emoji stands in for it.
				<span aria-hidden="true" className={cn("text-2xl leading-none", isBusy && "opacity-40")}>
					{sticker.emoji}
				</span>
			) : (
				// eslint-disable-next-line @next/next/no-img-element -- small SVGs from a pinned CDN commit; nothing for the optimiser to do
				<img
					src={stickerUrl(sticker.id)}
					alt=""
					loading="lazy"
					decoding="async"
					width={PREVIEW_SIZE}
					height={PREVIEW_SIZE}
					onError={() => setHasPreviewFailed(true)}
					className={cn("size-8", isBusy && "opacity-40")}
				/>
			)}
			{isBusy ? <Loader2 className="absolute size-4 animate-spin text-foreground" aria-hidden="true" /> : null}
		</button>
	);
}

type StickerGridProps = {
	stickers: readonly Sticker[];
	busyIds: ReadonlySet<string>;
	onInsert: (sticker: Sticker) => void;
};

function StickerGrid({ stickers, busyIds, onInsert }: StickerGridProps) {
	return (
		<ul className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-0.5">
			{stickers.map((sticker) => (
				<li key={sticker.id}>
					<StickerButton sticker={sticker} isBusy={busyIds.has(sticker.id)} onInsert={onInsert} />
				</li>
			))}
		</ul>
	);
}

/** A searchable set of emoji stickers. Each is fetched on click and stored inside the sketch. */
export function StickersTab({ api, query, onInserted }: InsertTabProps) {
	const [category, setCategory] = useState<CategoryFilter>("all");
	const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
	const [error, setError] = useState<string | null>(null);

	const matches = filterStickers(STICKERS, { query, category });
	// Without a search, "All" reads better split under its category headings.
	const groups = category === "all" && !query ? groupStickersByCategory(matches) : null;
	const categoryLabel = CATEGORY_CHIPS.find((chip) => chip.id === category)?.label ?? "";

	async function handleInsert(sticker: Sticker) {
		if (busyIds.has(sticker.id)) return;
		setError(null);
		setBusyIds((current) => new Set([...current, sticker.id]));

		const failure = await addSticker(api, sticker);
		if (failure) {
			setError(failure);
		} else {
			onInserted(sticker.name);
		}
		setBusyIds((current) => new Set([...current].filter((id) => id !== sticker.id)));
	}

	const insert = (sticker: Sticker) => void handleInsert(sticker);
	let results;
	if (matches.length === 0) {
		results = (
			<div className="space-y-2 p-4 text-sm text-muted-foreground">
				<p>
					No stickers match “{query}”{category === "all" ? "" : ` in ${categoryLabel}`}.
				</p>
				{category === "all" ? null : (
					<Button variant="outline" size="xs" onClick={() => setCategory("all")}>
						Search all categories
					</Button>
				)}
			</div>
		);
	} else if (groups) {
		results = (
			<div className="space-y-3 p-2">
				{groups.map((group) => (
					<section key={group.category.id} aria-labelledby={`sticker-group-${group.category.id}`}>
						<h3 id={`sticker-group-${group.category.id}`} className="px-1 pb-1 text-xs font-semibold text-muted-foreground">
							{group.category.label}
						</h3>
						<StickerGrid stickers={group.stickers} busyIds={busyIds} onInsert={insert} />
					</section>
				))}
			</div>
		);
	} else {
		results = (
			<div className="p-2">
				<StickerGrid stickers={matches} busyIds={busyIds} onInsert={insert} />
			</div>
		);
	}

	return (
		<div className="flex flex-col">
			<div role="group" aria-label="Filter by category" className="sticky top-0 z-10 flex flex-wrap gap-1 border-b border-rule bg-card px-3 py-2">
				{CATEGORY_CHIPS.map((chip) => (
					<button
						key={chip.id}
						type="button"
						aria-pressed={category === chip.id}
						onClick={() => setCategory(chip.id)}
						className={cn(
							"h-6 cursor-pointer rounded-sm border border-input px-2 text-xs font-medium text-muted-foreground hover:text-foreground",
							category === chip.id && "border-grid/60 bg-grid-tint font-semibold text-foreground",
						)}
					>
						{chip.label}
					</button>
				))}
			</div>

			{error ? (
				<p role="alert" className="border-b border-rule px-3 py-2 text-xs text-destructive">
					{error}
				</p>
			) : null}
			<p role="status" className="sr-only">
				{matches.length === 1 ? "1 sticker" : `${matches.length} stickers`}
			</p>

			{results}
		</div>
	);
}
