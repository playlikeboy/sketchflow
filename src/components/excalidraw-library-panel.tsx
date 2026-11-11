"use client";

import { Boxes, Check, Download, Loader2, RefreshCw, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	libraryAudiences,
	type ExcalidrawLibrary,
	type LibraryAudience,
} from "@/lib/excalidraw-libraries";
import { useExcalidrawLibraries } from "@/lib/swr-hooks";
import { cn } from "@/lib/utils";

type LibraryPanelProps = {
	installedSources: string[];
	installingSource: string | null;
	onInstall: (library: ExcalidrawLibrary) => Promise<void>;
	onClose?: () => void;
};

function matchesLibrary(library: ExcalidrawLibrary, query: string) {
	if (!query.trim()) return true;

	return query
		.toLowerCase()
		.split(/\s+/)
		.every((part) => library.searchText.includes(part));
}

function LibraryPreview({ library }: { library: ExcalidrawLibrary }) {
	const [failed, setFailed] = useState(false);

	if (!library.previewUrl || failed) {
		return (
			<div className="grid size-14 shrink-0 place-items-center rounded-md border border-rule bg-muted text-muted-foreground">
				<Boxes className="size-5" />
			</div>
		);
	}

	return (
		// eslint-disable-next-line @next/next/no-img-element -- remote community previews of unknown size
		<img
			src={library.previewUrl}
			alt=""
			loading="lazy"
			width={56}
			height={56}
			onError={() => setFailed(true)}
			className="size-14 shrink-0 rounded-md border border-rule bg-white object-contain p-1"
		/>
	);
}

export function ExcalidrawLibraryPanel({
	installedSources,
	installingSource,
	onInstall,
	onClose,
}: LibraryPanelProps) {
	const [audience, setAudience] = useState<LibraryAudience>("all");
	const [query, setQuery] = useState("");
	const { data, error, isLoading, mutate } = useExcalidrawLibraries();
	const installed = useMemo(() => new Set(installedSources), [installedSources]);
	const filteredLibraries = useMemo(() => {
		const libraries: ExcalidrawLibrary[] = data?.libraries ?? [];
		return libraries
			.filter((library) => audience === "all" || library.audiences.includes(audience))
			.filter((library) => matchesLibrary(library, query))
			.sort((left, right) => {
				const leftInstalled = installed.has(left.source) ? 1 : 0;
				const rightInstalled = installed.has(right.source) ? 1 : 0;
				if (leftInstalled !== rightInstalled) return rightInstalled - leftInstalled;

				const leftAudience = left.audiences.includes(audience as Exclude<LibraryAudience, "all">) ? 1 : 0;
				const rightAudience = right.audiences.includes(audience as Exclude<LibraryAudience, "all">) ? 1 : 0;
				if (leftAudience !== rightAudience) return rightAudience - leftAudience;

				return left.name.localeCompare(right.name);
			});
	}, [audience, data?.libraries, installed, query]);
	return (
		<aside className="flex h-full min-h-0 flex-col border-l border-border bg-card" aria-label="Shape libraries">
			<div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
				<div className="flex min-w-0 items-baseline gap-2">
					<h2 className="text-sm font-bold text-foreground">Libraries</h2>
					<span className="truncate text-xs text-muted-foreground">
						{data ? `${data.total} community shape packs` : "Community shape packs"}
					</span>
				</div>
				<div className="flex shrink-0 items-center gap-0.5">
					<Button variant="ghost" size="icon-xs" onClick={() => void mutate()} aria-label="Reload the library list" title="Reload">
						<RefreshCw />
					</Button>
					{onClose ? (
						<Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close libraries">
							<X />
						</Button>
					) : null}
				</div>
			</div>

			<div className="shrink-0 space-y-2 border-b border-border p-3">
				<div className="relative">
					<Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						type="search"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search, for example UML or floor plan"
						aria-label="Search libraries"
						className="h-8 pl-8"
					/>
				</div>
				<div role="group" aria-label="Filter by subject" className="flex flex-wrap gap-1">
					{libraryAudiences.map((item) => (
						<button
							key={item.id}
							type="button"
							aria-pressed={audience === item.id}
							onClick={() => setAudience(item.id)}
							className={cn(
								"h-6 cursor-pointer rounded-sm border border-input px-2 text-xs font-medium text-muted-foreground hover:text-foreground",
								audience === item.id && "border-grid/60 bg-grid-tint font-semibold text-foreground",
							)}
						>
							{item.label}
						</button>
					))}
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto">
				{isLoading ? (
					<div aria-busy="true" aria-label="Loading libraries">
						{[0, 1, 2, 3].map((item) => (
							<div key={item} className="flex gap-3 border-b border-rule p-3">
								<div className="size-14 shrink-0 animate-pulse rounded-md bg-muted" />
								<div className="flex-1 space-y-2 pt-1">
									<div className="h-3.5 w-2/3 animate-pulse rounded-sm bg-accent" />
									<div className="h-3 w-full animate-pulse rounded-sm bg-muted" />
								</div>
							</div>
						))}
					</div>
				) : error ? (
					<div className="p-3">
						<p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
							The library list could not be loaded. Check your connection and reload.
						</p>
						<Button variant="outline" size="sm" className="mt-2" onClick={() => void mutate()}>
							<RefreshCw />
							Reload
						</Button>
					</div>
				) : filteredLibraries.length === 0 ? (
					<p className="p-4 text-sm text-muted-foreground">
						No libraries match. Try a broader word such as cloud, UML, icons or math.
					</p>
				) : (
					<ul>
						{filteredLibraries.map((library) => {
							const isInstalled = installed.has(library.source);
							const isInstalling = installingSource === library.source;

							return (
								<li key={library.source} className="flex gap-3 border-b border-rule p-3 last:border-b-0">
									<LibraryPreview library={library} />
									<div className="min-w-0 flex-1">
										<h3 className="truncate text-sm font-semibold text-foreground">{library.name}</h3>
										{library.description ? (
											<p className="mt-0.5 line-clamp-2 text-[0.8125rem] text-muted-foreground">{library.description}</p>
										) : null}
										<div className="mt-1.5 flex items-center justify-between gap-2">
											<span className="min-w-0 truncate text-xs text-muted-foreground">
												{library.authors[0]?.name ?? "Excalidraw community"}
											</span>
											{isInstalled ? (
												<span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-wood">
													<Check className="size-3.5" />
													Added
												</span>
											) : (
												<Button size="xs" variant="outline" disabled={isInstalling} onClick={() => void onInstall(library)}>
													{isInstalling ? <Loader2 className="animate-spin" /> : <Download />}
													{isInstalling ? "Adding" : "Add"}
												</Button>
											)}
										</div>
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</aside>
	);
}
