"use client";

import { Boxes, ChevronRight, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { PackRef } from "@/components/editor/insert/libraries/pack";
import type { PackSections } from "@/components/editor/insert/libraries/pack-filter";
import { Button } from "@/components/ui/button";
import { libraryAudiences, type ExcalidrawLibrary, type LibraryAudience } from "@/lib/excalidraw-libraries";
import { cn } from "@/lib/utils";

const SKELETON_ROWS = [0, 1, 2, 3, 4];
const SECTION_HEADING = "px-3 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase";

export type CatalogStatus = "loading" | "failed" | "ready";

function PackPreview({ url }: { url: string }) {
	const [hasFailed, setHasFailed] = useState(false);

	if (!url || hasFailed) {
		return (
			<span className="grid size-10 shrink-0 place-items-center rounded-md border border-rule bg-muted text-muted-foreground">
				<Boxes className="size-4" aria-hidden="true" />
			</span>
		);
	}

	return (
		// eslint-disable-next-line @next/next/no-img-element -- remote community previews of unknown size
		<img
			src={url}
			alt=""
			loading="lazy"
			width={40}
			height={40}
			onError={() => setHasFailed(true)}
			className="size-10 shrink-0 rounded-md border border-rule bg-white object-contain p-0.5"
		/>
	);
}

type PackRowProps = {
	pack: PackRef;
	library: ExcalidrawLibrary | null;
	shouldFocus: boolean;
	onOpen: (pack: PackRef) => void;
	/** Present only for packs in "Your libraries". */
	onRemove?: (source: string) => void;
};

function PackRow({ pack, library, shouldFocus, onOpen, onRemove }: PackRowProps) {
	const openRef = useRef<HTMLButtonElement>(null);
	const details = [pack.author, library && library.itemNames.length > 0 ? `${library.itemNames.length} shapes` : null].filter(Boolean).join(" · ");

	useEffect(() => {
		// Coming back from a pack: put the keyboard (and the scroll position) where it was.
		if (shouldFocus) openRef.current?.focus();
	}, [shouldFocus]);

	return (
		<li className="flex items-center border-b border-rule last:border-b-0">
			<button
				ref={openRef}
				type="button"
				onClick={() => onOpen(pack)}
				className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-3 py-2 text-left -outline-offset-2 hover:bg-accent"
			>
				<PackPreview url={library?.previewUrl ?? ""} />
				<span className="min-w-0 flex-1">
					<span className="block truncate text-sm font-semibold text-foreground">{pack.name}</span>
					{library?.description ? <span className="block truncate text-xs text-muted-foreground">{library.description}</span> : null}
					{details ? <span className="block truncate text-xs text-muted-foreground">{details}</span> : null}
				</span>
				<ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
			</button>
			{onRemove ? (
				<Button
					variant="ghost"
					size="icon-xs"
					className="mr-1.5"
					onClick={() => onRemove(pack.source)}
					aria-label={`Remove ${pack.name} from your libraries`}
					title="Remove from your libraries"
				>
					<X />
				</Button>
			) : null}
		</li>
	);
}

function toPackRef(library: ExcalidrawLibrary): PackRef {
	return { source: library.source, name: library.name, author: library.authors[0]?.name ?? null };
}

function emptyMessage(query: string, audience: LibraryAudience, hasYours: boolean) {
	const libraries = hasYours ? "other libraries" : "libraries";
	if (query) return `No ${libraries} match “${query}”. Try a broader word such as cloud, UML, icons or math.`;
	if (audience !== "all") return `No ${libraries} for this subject.`;
	return hasYours ? "Every library is already in your libraries." : "No libraries are available right now.";
}

type PackListProps = {
	sections: PackSections;
	catalog: CatalogStatus;
	query: string;
	audience: LibraryAudience;
	/** The pack whose row gets keyboard focus when the list appears, if it is listed. */
	focusSource: string | null;
	onAudienceChange: (audience: LibraryAudience) => void;
	onOpen: (pack: PackRef) => void;
	onRemove: (source: string) => void;
	onRetry: () => void;
};

/** Level one of the Libraries tab: "Your libraries", then every other community pack. */
export function PackList({ sections, catalog, query, audience, focusSource, onAudienceChange, onOpen, onRemove, onRetry }: PackListProps) {
	const { yours, others } = sections;

	return (
		<div>
			<div role="group" aria-label="Filter by subject" className="flex flex-wrap gap-1 border-b border-rule px-3 py-2">
				{libraryAudiences.map((item) => (
					<button
						key={item.id}
						type="button"
						aria-pressed={audience === item.id}
						title={item.description}
						onClick={() => onAudienceChange(item.id)}
						className={cn(
							"h-6 cursor-pointer rounded-sm border border-input px-2 text-xs font-medium text-muted-foreground hover:text-foreground",
							audience === item.id && "border-grid/60 bg-grid-tint font-semibold text-foreground",
						)}
					>
						{item.label}
					</button>
				))}
			</div>

			{yours.length > 0 ? (
				<section aria-labelledby="insert-your-libraries">
					<h3 id="insert-your-libraries" className={SECTION_HEADING}>
						Your libraries
					</h3>
					<ul>
						{yours.map((pack) => (
							<PackRow
								key={pack.source}
								pack={{ source: pack.source, name: pack.name, author: pack.library?.authors[0]?.name ?? null }}
								library={pack.library}
								shouldFocus={pack.source === focusSource}
								onOpen={onOpen}
								onRemove={onRemove}
							/>
						))}
					</ul>
				</section>
			) : null}

			<section aria-labelledby="insert-all-libraries">
				<h3 id="insert-all-libraries" className={SECTION_HEADING}>
					{yours.length > 0 ? "More libraries" : "All libraries"}
				</h3>
				{catalog === "loading" ? (
					<div role="status">
						<span className="sr-only">Loading libraries</span>
						{SKELETON_ROWS.map((row) => (
							<div key={row} className="flex items-center gap-2.5 border-b border-rule px-3 py-2">
								<div className="size-10 shrink-0 animate-pulse rounded-md bg-muted" />
								<div className="flex-1 space-y-1.5">
									<div className="h-3.5 w-2/3 animate-pulse rounded-sm bg-accent" />
									<div className="h-3 w-full animate-pulse rounded-sm bg-muted" />
								</div>
							</div>
						))}
					</div>
				) : catalog === "failed" ? (
					<div className="px-3 pb-3">
						<p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
							The list of libraries could not be loaded. Check your connection and try again.
						</p>
						<Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
							<RefreshCw />
							Try again
						</Button>
					</div>
				) : others.length === 0 ? (
					<p className="px-3 pb-4 text-sm text-muted-foreground">{emptyMessage(query, audience, yours.length > 0)}</p>
				) : (
					<ul>
						{others.map((library) => (
							<PackRow
								key={library.source}
								pack={toPackRef(library)}
								library={library}
								shouldFocus={library.source === focusSource}
								onOpen={onOpen}
							/>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
