"use client";

import {
	BookOpen,
	Boxes,
	Building2,
	Check,
	Code2,
	Download,
	GraduationCap,
	Loader2,
	RefreshCw,
	Search,
	Sparkles,
} from "lucide-react";
import type { ComponentType } from "react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
};

const audienceIcons = {
	all: Boxes,
	architects: Building2,
	devs: Code2,
	teachers: GraduationCap,
} satisfies Record<LibraryAudience, ComponentType<{ className?: string }>>;

const audienceCopy: Record<LibraryAudience, string[]> = {
	all: ["Search all public packs", "Import once, reuse from the Excalidraw library drawer"],
	architects: ["Floor plans, furniture, spaces, wiring, site maps", "Good for client reviews and early spatial thinking"],
	devs: ["Cloud, UML, ERD, C4, networks, systems", "Good for architecture reviews and technical docs"],
	teachers: ["Math, science, slides, sticky notes, classroom visuals", "Good for lesson boards and visual explanations"],
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
			<div className="grid h-24 place-items-center rounded-lg border bg-muted text-muted-foreground">
				<Boxes className="size-6" />
			</div>
		);
	}

	return (
		<img
			src={library.previewUrl}
			alt=""
			loading="lazy"
			onError={() => setFailed(true)}
			className="h-24 w-full rounded-lg border bg-white object-contain p-2 dark:bg-white"
		/>
	);
}

export function ExcalidrawLibraryPanel({
	installedSources,
	installingSource,
	onInstall,
}: LibraryPanelProps) {
	const [audience, setAudience] = useState<LibraryAudience>("all");
	const [query, setQuery] = useState("");
	const { data, error, isLoading, mutate } = useExcalidrawLibraries();
	const installed = useMemo(() => new Set(installedSources), [installedSources]);
	const libraries: ExcalidrawLibrary[] = data?.libraries ?? [];
	const filteredLibraries = useMemo(() => {
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
	}, [audience, installed, libraries, query]);
	const activeAudience = libraryAudiences.find((item) => item.id === audience) ?? libraryAudiences[0];
	const ActiveIcon = audienceIcons[audience];

	return (
		<aside className="flex h-full min-h-0 flex-col border-l bg-background">
			<div className="shrink-0 border-b px-4 py-3">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<Sparkles className="size-4 text-[#CE82FF]" />
							<h2 className="text-sm font-bold text-foreground">Libraries</h2>
						</div>
						<p className="mt-1 text-xs font-medium text-muted-foreground">
							{data?.total ?? 0} public Excalidraw packs, curated for real work.
						</p>
					</div>
					<Button variant="ghost" size="icon-sm" onClick={() => void mutate()} aria-label="Refresh libraries">
						<RefreshCw className="size-4" />
					</Button>
				</div>

				<Tabs value={audience} onValueChange={(value) => setAudience(value as LibraryAudience)} className="mt-3">
					<TabsList className="grid h-auto w-full grid-cols-4 rounded-xl bg-muted p-1">
						{libraryAudiences.map((item) => {
							const Icon = audienceIcons[item.id];

							return (
								<TabsTrigger key={item.id} value={item.id} className="h-9 gap-1 px-2 text-xs">
									<Icon className="size-3.5" />
									<span className="hidden sm:inline">{item.label}</span>
								</TabsTrigger>
							);
						})}
					</TabsList>
				</Tabs>

				<div className="mt-3 rounded-lg border bg-card p-3">
					<div className="flex items-center gap-2">
						<ActiveIcon className="size-4 text-[#1CB0F6]" />
						<div className="text-xs font-bold uppercase text-muted-foreground">{activeAudience.label}</div>
					</div>
					<div className="mt-2 space-y-1">
						{audienceCopy[audience].map((line) => (
							<div key={line} className="flex gap-2 text-xs font-medium text-muted-foreground">
								<Check className="mt-0.5 size-3 shrink-0 text-[#58CC02]" />
								<span>{line}</span>
							</div>
						))}
					</div>
				</div>

				<div className="relative mt-3">
					<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search AWS, UML, floor plan, math..."
						className="h-10 rounded-xl pl-9 text-sm"
					/>
				</div>
			</div>

			<ScrollArea className="min-h-0 flex-1">
				<div className="space-y-3 p-4">
					{isLoading ? (
						<div className="grid h-48 place-items-center text-sm font-bold text-muted-foreground">
							<div className="flex items-center gap-2">
								<Loader2 className="size-4 animate-spin text-[#58CC02]" />
								Loading library catalog
							</div>
						</div>
					) : error ? (
						<div className="rounded-xl border border-[#FF4B4B]/30 bg-[#FF4B4B]/10 p-3 text-sm font-bold text-[#FF4B4B]">
							Library catalog could not be loaded.
						</div>
					) : filteredLibraries.length === 0 ? (
						<div className="rounded-xl border bg-background p-4 text-sm font-semibold text-muted-foreground">
							No packs match this search yet. Try cloud, UML, floor plan, math, presentation, or icons.
						</div>
					) : (
						filteredLibraries.map((library) => {
							const isInstalled = installed.has(library.source);
							const isInstalling = installingSource === library.source;

							return (
								<div
									key={library.source}
									className={cn(
										"rounded-lg border bg-card p-3 transition-colors hover:border-foreground/30",
										isInstalled && "border-[#58CC02]/50 bg-[#58CC02]/5",
									)}
								>
									<LibraryPreview library={library} />
									<div className="mt-3 flex items-start justify-between gap-3">
										<div className="min-w-0">
											<div className="truncate text-sm font-bold text-foreground">{library.name}</div>
											<p className="mt-1 line-clamp-2 text-xs font-medium text-muted-foreground">
												{library.description || "Ready-to-use Excalidraw library pack."}
											</p>
										</div>
										<Badge variant={isInstalled ? "default" : "secondary"}>
											{isInstalled ? "Added" : `${library.audiences.length || 1} fit`}
										</Badge>
									</div>

									<div className="mt-3 flex flex-wrap gap-1.5">
										{library.audiences.length > 0 ? (
											library.audiences.map((item) => (
												<Badge key={item} variant="outline" className="h-5 px-2 text-[10px]">
													{libraryAudiences.find((audienceItem) => audienceItem.id === item)?.label ?? item}
												</Badge>
											))
										) : (
											<Badge variant="outline" className="h-5 px-2 text-[10px]">
												General
											</Badge>
										)}
									</div>

									<div className="mt-3 flex items-center justify-between gap-2">
										<div className="min-w-0 truncate text-[11px] font-medium text-muted-foreground">
											{library.authors[0]?.name ?? "Excalidraw community"}
										</div>
										<Button
											size="sm"
											variant={isInstalled ? "secondary" : "default"}
											disabled={isInstalling || isInstalled}
											onClick={() => void onInstall(library)}
										>
											{isInstalling ? (
												<Loader2 className="size-4 animate-spin" />
											) : isInstalled ? (
												<BookOpen className="size-4" />
											) : (
												<Download className="size-4" />
											)}
											{isInstalled ? "Added" : "Import"}
										</Button>
									</div>
								</div>
							);
						})
					)}
				</div>
			</ScrollArea>
		</aside>
	);
}
