"use client";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { LoaderCircle } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import useSWRImmutable from "swr/immutable";

import type { InsertTabProps } from "@/components/editor/insert/types";
import { Button } from "@/components/ui/button";
import { insertImage, svgToImage } from "@/lib/canvas-insert";
import {
	SIMPLE_ICONS_INDEX_URL,
	canvasBackgroundColour,
	colourSimpleIcon,
	fetchSimpleIconSvg,
	loadSimpleIconsIndex,
	monochromeLogoColour,
	resolveLogoColour,
	searchSimpleIcons,
	simpleIconUrl,
	type LogoColourMode,
	type ResolvedLogoColour,
	type SimpleIcon,
} from "@/lib/simple-icons";
import { cn } from "@/lib/utils";

/** How many logos are drawn at first, and how many more each "Show more" adds. */
const PAGE_SIZE = 60;
/** Longest side of an inserted logo in scene units. Logos are icons, not illustrations. */
const LOGO_INSERT_SIZE = 96;

const COLOUR_MODES: { id: LogoColourMode; label: string; hint: string }[] = [
	{ id: "brand", label: "Brand colour", hint: "Each brand's own colour. Colours too close to the canvas are swapped for black or white." },
	{ id: "mono", label: "Black/white", hint: "White on a dark canvas, black on a light one." },
];

/** Downloads one logo, colours it and puts it on the canvas. Errors carry a message for the person. */
async function insertLogo(api: ExcalidrawImperativeAPI, icon: SimpleIcon, colour: string) {
	const svg = await fetchSimpleIconSvg(icon.slug).catch((cause: unknown) => {
		throw new Error(`The ${icon.title} logo could not be downloaded. Check your connection and try again.`, { cause });
	});

	try {
		await insertImage(api, { ...svgToImage(colourSimpleIcon(svg, colour)), targetSize: LOGO_INSERT_SIZE });
	} catch (cause) {
		throw new Error(`The ${icon.title} logo could not be added to the canvas.`, { cause });
	}
}

/** Paints the remote SVG in one colour: the SVG is the mask, the colour is the background. */
function previewStyle(slug: string, colour: string): CSSProperties {
	const mask = `url("${simpleIconUrl(slug)}") center / contain no-repeat`;
	return { backgroundColor: colour, mask, WebkitMask: mask };
}

export function LogosTab({ api, isDark, query, onInserted }: InsertTabProps) {
	const index = useSWRImmutable<readonly SimpleIcon[], Error>(SIMPLE_ICONS_INDEX_URL, () => loadSimpleIconsIndex(), {
		shouldRetryOnError: false,
	});
	const [colourMode, setColourMode] = useState<LogoColourMode>("brand");
	const [expanded, setExpanded] = useState({ query, count: PAGE_SIZE });
	const [busySlug, setBusySlug] = useState<string | null>(null);
	const [insertError, setInsertError] = useState<string | null>(null);
	const matches = useMemo(() => (index.data ? searchSimpleIcons(index.data, query) : []), [index.data, query]);

	// A new search starts again from the first page.
	const visibleCount = expanded.query === query ? expanded.count : PAGE_SIZE;
	const visible = matches.slice(0, visibleCount);

	async function handleInsert(icon: SimpleIcon) {
		if (busySlug) return;
		setBusySlug(icon.slug);
		setInsertError(null);
		try {
			await insertLogo(api, icon, resolveLogoColour(icon.hex, colourMode, isDark).colour);
			onInserted(icon.title);
		} catch (error) {
			setInsertError(error instanceof Error ? error.message : `The ${icon.title} logo could not be added.`);
		} finally {
			setBusySlug(null);
		}
	}

	if (!index.data) {
		return <IndexStatus hasFailed={Boolean(index.error) && !index.isValidating} onRetry={() => void index.mutate()} />;
	}

	return (
		<div className="flex min-h-full flex-col">
			<div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-card px-3 py-2">
				<ColourChoice value={colourMode} onChange={setColourMode} />
				<p className="text-xs text-muted-foreground tabular-nums">
					{matches.length === 1 ? "1 logo" : `${matches.length.toLocaleString("en")} logos`}
				</p>
			</div>

			{insertError ? (
				<p role="alert" className="mx-3 mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
					{insertError}
				</p>
			) : null}

			{matches.length === 0 ? (
				<p role="status" className="p-4 text-sm text-muted-foreground">
					No logos match “{query}”. Try the brand’s full name.
				</p>
			) : (
				<ul className="grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-0.5 p-2">
					{visible.map((icon) => (
						<li key={icon.slug} className="min-w-0">
							<LogoButton
								icon={icon}
								colour={resolveLogoColour(icon.hex, colourMode, isDark)}
								isDark={isDark}
								isBusy={busySlug === icon.slug}
								isBlocked={busySlug !== null}
								onInsert={handleInsert}
							/>
						</li>
					))}
				</ul>
			)}

			{visible.length < matches.length ? (
				<div className="flex flex-col items-center gap-1.5 px-3 pb-3">
					<Button type="button" variant="outline" size="xs" onClick={() => setExpanded({ query, count: visibleCount + PAGE_SIZE })}>
						Show more
					</Button>
					<p className="text-[0.6875rem] text-muted-foreground tabular-nums">
						Showing {visible.length.toLocaleString("en")} of {matches.length.toLocaleString("en")}
					</p>
				</div>
			) : null}

			<p className="mt-auto border-t border-rule px-3 py-2 text-[0.6875rem] leading-snug text-muted-foreground">
				Logos are trademarks of their owners. Icons from{" "}
				<a href="https://simpleicons.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
					Simple Icons
				</a>
				.
			</p>
		</div>
	);
}

/** Shown until the list of logos has arrived: a loading line, or the failure and a way to retry. */
function IndexStatus({ hasFailed, onRetry }: { hasFailed: boolean; onRetry: () => void }) {
	if (!hasFailed) {
		return (
			<p role="status" className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
				<LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
				Loading logos…
			</p>
		);
	}

	return (
		<div role="alert" className="flex flex-col items-start gap-2 p-4 text-sm">
			<p>The list of logos could not be loaded. Check your connection and try again.</p>
			<Button type="button" variant="outline" size="sm" onClick={onRetry}>
				Retry
			</Button>
		</div>
	);
}

function ColourChoice({ value, onChange }: { value: LogoColourMode; onChange: (mode: LogoColourMode) => void }) {
	return (
		<div role="group" aria-label="Logo colour" className="inline-flex rounded-md border border-rule p-0.5">
			{COLOUR_MODES.map((mode) => (
				<button
					key={mode.id}
					type="button"
					aria-pressed={value === mode.id}
					title={mode.hint}
					onClick={() => onChange(mode.id)}
					className={cn(
						"h-6 cursor-pointer rounded px-2 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
						value === mode.id ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
					)}
				>
					{mode.label}
				</button>
			))}
		</div>
	);
}

type LogoButtonProps = {
	icon: SimpleIcon;
	colour: ResolvedLogoColour;
	isDark: boolean;
	/** This logo is being downloaded and inserted. */
	isBusy: boolean;
	/** Some logo is being inserted, so clicks are ignored for a moment. */
	isBlocked: boolean;
	onInsert: (icon: SimpleIcon) => void;
};

function LogoButton({ icon, colour, isDark, isBusy, isBlocked, onInsert }: LogoButtonProps) {
	const [preview, setPreview] = useState<"loading" | "ready" | "failed">("loading");
	const monochrome = monochromeLogoColour(isDark);
	const fallbackNote = colour.isFallback ? ` (shown in ${isDark ? "white" : "black"}: its brand colour is too close to the canvas)` : "";

	return (
		<button
			type="button"
			aria-label={`Insert ${icon.title} logo`}
			aria-busy={isBusy}
			// Not `disabled`: that would drop keyboard focus from the logo that was just chosen.
			aria-disabled={isBlocked}
			title={`${icon.title}${fallbackNote}`}
			onClick={() => onInsert(icon)}
			className="flex w-full min-w-0 cursor-pointer flex-col items-center gap-1 rounded-md p-1.5 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px aria-disabled:cursor-progress"
		>
			{/* The tile is the canvas colour, so the preview shows what will land on the canvas. */}
			<span
				className="relative flex size-10 items-center justify-center rounded-md border border-rule"
				style={{ backgroundColor: canvasBackgroundColour(isDark), color: monochrome }}
			>
				{isBusy ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
				{!isBusy && preview === "ready" ? <span className="size-6" style={previewStyle(icon.slug, colour.colour)} /> : null}
				{!isBusy && preview === "failed" ? (
					<span className="text-sm font-bold" aria-hidden="true">
						{icon.title.slice(0, 1)}
					</span>
				) : null}
				{/* Invisible: it only makes the browser fetch the SVG lazily, when the tile nears the
				    view, and reports whether that worked. The coloured mask above then reuses it. */}
				{/* eslint-disable-next-line @next/next/no-img-element -- a 24px remote SVG from a pinned, immutable CDN release */}
				<img
					src={simpleIconUrl(icon.slug)}
					alt=""
					// Fetched the same way as the mask and the insert, so all three share one cached copy.
					crossOrigin="anonymous"
					width={24}
					height={24}
					loading="lazy"
					decoding="async"
					onLoad={() => setPreview("ready")}
					onError={() => setPreview("failed")}
					className="pointer-events-none absolute inset-0 size-full opacity-0"
				/>
			</span>
			<span className="w-full truncate text-center text-[0.6875rem] leading-tight">{icon.title}</span>
		</button>
	);
}
