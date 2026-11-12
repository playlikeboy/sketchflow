"use client";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { BookOpen, Building2, Image as ImageIcon, Search, Shapes, Smile, Upload, X, type LucideIcon } from "lucide-react";
import { useCallback, useState, type ComponentType } from "react";

import { DiagramsTab } from "@/components/editor/insert/diagrams-tab";
import { LibrariesTab } from "@/components/editor/insert/libraries-tab";
import { LogosTab } from "@/components/editor/insert/logos-tab";
import { PhotosTab } from "@/components/editor/insert/photos-tab";
import { StickersTab } from "@/components/editor/insert/stickers-tab";
import type { InsertTabProps } from "@/components/editor/insert/types";
import { UploadTab } from "@/components/editor/insert/upload-tab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type InsertTab = {
	id: string;
	label: string;
	icon: LucideIcon;
	/** What the shared search box looks for on this tab. Null when the tab has nothing to search. */
	searchPlaceholder: string | null;
	Component: ComponentType<InsertTabProps>;
};

const TABS: InsertTab[] = [
	{ id: "libraries", label: "Libraries", icon: BookOpen, searchPlaceholder: "Search shape libraries", Component: LibrariesTab },
	{ id: "diagrams", label: "Diagrams", icon: Shapes, searchPlaceholder: null, Component: DiagramsTab },
	{ id: "logos", label: "Logos", icon: Building2, searchPlaceholder: "Search company logos", Component: LogosTab },
	{ id: "photos", label: "Photos", icon: ImageIcon, searchPlaceholder: "Search photos", Component: PhotosTab },
	{ id: "stickers", label: "Stickers", icon: Smile, searchPlaceholder: "Search stickers", Component: StickersTab },
	{ id: "upload", label: "Upload", icon: Upload, searchPlaceholder: null, Component: UploadTab },
];

export type InsertPanelProps = {
	/** The live canvas, or null while it is still loading. */
	api: ExcalidrawImperativeAPI | null;
	isDark: boolean;
	onClose?: () => void;
};

/**
 * One place to add things to the canvas: shape libraries, diagram starters, company logos,
 * photos, stickers and uploads. Each tab inserts at the centre of the view at one size.
 */
export function InsertPanel({ api, isDark, onClose }: InsertPanelProps) {
	const [activeTab, setActiveTab] = useState(TABS[0].id);
	const [query, setQuery] = useState("");
	const [status, setStatus] = useState("");
	const active = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];
	const handleInserted = useCallback((label: string) => setStatus(`Added ${label}`), []);

	return (
		<aside aria-label="Insert" className="flex h-full min-h-0 flex-col border-l border-border bg-card">
			<header className="flex items-center justify-between gap-2 border-b border-rule px-3 py-2">
				<h2 className="text-sm font-bold">Insert</h2>
				{onClose ? (
					<Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close insert panel" title="Close">
						<X />
					</Button>
				) : null}
			</header>

			<Tabs value={active.id} onValueChange={setActiveTab} className="min-h-0 flex-1 gap-0">
				<div className="border-b border-rule px-3 py-2">
					<TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
						{TABS.map((tab) => (
							<TabsTrigger key={tab.id} value={tab.id} className="h-7 flex-none gap-1.5 px-2 text-xs">
								<tab.icon className="size-3.5" aria-hidden="true" />
								{tab.label}
							</TabsTrigger>
						))}
					</TabsList>
					{active.searchPlaceholder ? (
						<div className="relative mt-2">
							<Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
							<Input
								type="search"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder={active.searchPlaceholder}
								aria-label={active.searchPlaceholder}
								className="pl-8"
							/>
						</div>
					) : null}
				</div>

				{TABS.map((tab) => (
					<TabsContent key={tab.id} value={tab.id} className="min-h-0 flex-1 overflow-y-auto">
						{api ? (
							<tab.Component api={api} isDark={isDark} query={query.trim()} onInserted={handleInserted} />
						) : (
							<p className="p-4 text-sm text-muted-foreground">The canvas is still loading.</p>
						)}
					</TabsContent>
				))}
			</Tabs>

			<p role="status" aria-live="polite" className="min-h-7 border-t border-rule px-3 py-1.5 text-xs text-muted-foreground">
				{status}
			</p>
		</aside>
	);
}
