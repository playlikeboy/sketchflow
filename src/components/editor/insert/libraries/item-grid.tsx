"use client";

import { ImageOff } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";

import { nearestScroller } from "@/components/editor/insert/libraries/dom";
import type { PackItem } from "@/components/editor/insert/libraries/pack";
import { DARK_PREVIEW_FILTER, cachedThumbnail, requestThumbnail } from "@/components/editor/insert/libraries/thumbnails";
import { cn } from "@/lib/utils";

/** Previews start drawing this far before a cell scrolls into view. */
const PRELOAD_MARGIN = "200px 0px";
const NO_CELLS: ReadonlySet<number> = new Set();

type ItemCellProps = {
	item: PackItem;
	/** What a screen reader announces, for example "Add Lambda". */
	label: string;
	isDark: boolean;
	isVisible: boolean;
	showName: boolean;
	onInsert: (item: PackItem) => void;
};

const ItemCell = memo(function ItemCell({ item, label, isDark, isVisible, showName, onInsert }: ItemCellProps) {
	const [src, setSrc] = useState(() => cachedThumbnail(item.elements));
	const [hasFailed, setHasFailed] = useState(false);

	useEffect(() => {
		if (!isVisible || src || hasFailed) return;
		// Cancelled when the cell scrolls away or unmounts before its turn comes.
		return requestThumbnail(item.elements, (result) => {
			if (result) setSrc(result);
			else setHasFailed(true);
		});
	}, [isVisible, src, hasFailed, item.elements]);

	return (
		<button
			type="button"
			onClick={() => onInsert(item)}
			aria-label={label}
			title={hasFailed ? `${label} (no preview)` : label}
			className="group/item flex w-full cursor-pointer flex-col gap-1 rounded-md text-left"
		>
			<span
				className={cn(
					"grid aspect-square w-full place-items-center overflow-hidden rounded-md border border-rule p-1.5 group-hover/item:border-grid/60",
					isDark ? "bg-[#121212]" : "bg-white",
				)}
			>
				{src && !hasFailed ? (
					// eslint-disable-next-line @next/next/no-img-element -- an in-memory SVG data URL, not a file to optimise
					<img
						src={src}
						alt=""
						draggable={false}
						onError={() => setHasFailed(true)}
						style={isDark ? { filter: DARK_PREVIEW_FILTER } : undefined}
						className="size-full object-contain"
					/>
				) : hasFailed ? (
					<ImageOff className="size-4 text-muted-foreground" aria-hidden="true" />
				) : (
					<span className="size-full animate-pulse rounded-sm bg-muted" />
				)}
			</span>
			{showName ? <span className="block h-4 truncate text-[0.6875rem] leading-4 text-muted-foreground">{item.name}</span> : null}
		</button>
	);
});

type ItemGridProps = {
	items: readonly PackItem[];
	packName: string;
	isDark: boolean;
	onInsert: (item: PackItem) => void;
};

/** The shapes of one pack as a grid of preview buttons. Previews are drawn as cells come into view. */
export function ItemGrid({ items, packName, isDark, onInsert }: ItemGridProps) {
	const gridRef = useRef<HTMLUListElement>(null);
	const [visibleCells, setVisibleCells] = useState<ReadonlySet<number>>(NO_CELLS);
	const showNames = items.some((item) => item.name);

	useEffect(() => {
		const grid = gridRef.current;
		if (!grid) return;

		const cells = Array.from(grid.querySelectorAll<HTMLElement>("[data-cell]"));
		if (typeof IntersectionObserver === "undefined") {
			// No way to tell what is on screen: draw everything, still a couple at a time.
			setVisibleCells(new Set(cells.map((_, index) => index)));
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				setVisibleCells((current) => {
					const next = new Set(current);
					for (const entry of entries) {
						if (!(entry.target instanceof HTMLElement)) continue;
						const index = Number(entry.target.dataset.cell);
						if (entry.isIntersecting) next.add(index);
						else next.delete(index);
					}
					return next;
				});
			},
			{ root: nearestScroller(grid), rootMargin: PRELOAD_MARGIN },
		);
		cells.forEach((cell) => observer.observe(cell));
		return () => observer.disconnect();
	}, [items]);

	return (
		<ul ref={gridRef} aria-label={`Shapes in ${packName}`} className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2 p-3">
			{items.map((item, index) => (
				<li key={item.key} data-cell={index}>
					<ItemCell
						item={item}
						label={item.name ? `Add ${item.name}` : `Add shape ${index + 1} of ${items.length}`}
						isDark={isDark}
						isVisible={visibleCells.has(index)}
						showName={showNames}
						onInsert={onInsert}
					/>
				</li>
			))}
		</ul>
	);
}
