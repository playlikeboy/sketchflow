"use client";

import { ImageUp, Loader2 } from "lucide-react";
import { useId, useRef, useState, type ChangeEvent, type DragEvent } from "react";

import type { InsertTabProps } from "@/components/editor/insert/types";
import { insertImage, MAX_EMBEDDED_IMAGE_DIMENSION, rasterToImage, svgToImage, type InsertImageInput } from "@/lib/canvas-insert";
import {
	checkUpload,
	formatBytes,
	MAX_RASTER_BYTES,
	MAX_SVG_BYTES,
	sanitizeSvg,
	summarizeUpload,
	takeUploadBatch,
	UPLOAD_ACCEPT,
	UPLOAD_MESSAGES,
	type UploadReport,
} from "@/lib/upload-image";
import { cn } from "@/lib/utils";

/** Longest side, in scene units, of an inserted SVG and of an inserted photo. */
const SVG_INSERT_SIZE = 240;
const RASTER_INSERT_SIZE = 360;
const INSERT_FAILED = "Could not be added to the canvas. Try again.";

type CanvasApi = InsertTabProps["api"];
type Prepared = { ok: true; image: InsertImageInput } | { ok: false; message: string };
type Progress = { done: number; total: number };

/** Reads one file in the browser and turns it into an embeddable image, or says why not. */
async function prepareFile(file: File): Promise<Prepared> {
	const check = checkUpload(file);
	if (!check.ok) return check;

	try {
		if (check.kind === "svg") {
			const cleaned = sanitizeSvg(await file.text());
			if (!cleaned.ok) return cleaned;
			return { ok: true, image: { ...svgToImage(cleaned.svg), targetSize: SVG_INSERT_SIZE } };
		}
		const image = await rasterToImage(file, { keepTransparency: check.keepTransparency });
		return { ok: true, image: { ...image, targetSize: RASTER_INSERT_SIZE } };
	} catch (failure) {
		// The browser could not decode the file: it is damaged, or not the type its name claims.
		console.warn("An uploaded image could not be read:", failure);
		return { ok: false, message: UPLOAD_MESSAGES.unreadable };
	}
}

/** Adds one file to the canvas. Resolves to null on success, or to a message for the person. */
async function addFile(api: CanvasApi, file: File): Promise<string | null> {
	const prepared = await prepareFile(file);
	if (!prepared.ok) return prepared.message;

	try {
		await insertImage(api, prepared.image);
		return null;
	} catch (failure) {
		console.warn("An uploaded image could not be added to the canvas:", failure);
		return INSERT_FAILED;
	}
}

function hasFiles(event: DragEvent<HTMLElement>) {
	return Array.from(event.dataTransfer.types).includes("Files");
}

type UploadStatusProps = { progressLabel: string | null; report: UploadReport | null };

/** The live region: what is happening now, then the outcome and any files that were left out. */
function UploadStatus({ progressLabel, report }: UploadStatusProps) {
	return (
		<div role="status" aria-live="polite" className="space-y-1.5 text-xs">
			{progressLabel ? <p className="sr-only">{progressLabel}</p> : null}
			{report ? <p className="font-semibold text-foreground">{summarizeUpload(report)}</p> : null}
			{report && report.failures.length > 0 ? (
				<ul className="space-y-1">
					{report.failures.map((failure, index) => (
						<li key={`${index}-${failure.name}`} className="rounded-sm border border-rule px-2 py-1.5">
							<span className="block font-semibold break-all text-foreground">{failure.name}</span>
							<span className="text-destructive">{failure.message}</span>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}

/** Adds the person's own SVG, PNG, JPEG, WebP and GIF files. Everything happens in the browser. */
export function UploadTab({ api, onInserted }: InsertTabProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const hintId = useId();
	// Enter and leave fire for every child the pointer crosses, so the depth says when it has really left.
	const dragDepth = useRef(0);
	const [isDragging, setIsDragging] = useState(false);
	const [progress, setProgress] = useState<Progress | null>(null);
	const [report, setReport] = useState<UploadReport | null>(null);
	const isBusy = progress !== null;

	async function handleFiles(files: readonly File[]) {
		if (isBusy || files.length === 0) return;
		const { accepted, skipped } = takeUploadBatch(files);
		let next: UploadReport = { added: 0, failures: [] };
		setReport(null);

		try {
			// One at a time, so each image is a separate undo step and a slow file cannot reorder them.
			for (const [index, file] of accepted.entries()) {
				setProgress({ done: index, total: accepted.length });
				const message = await addFile(api, file);
				if (message) {
					next = { ...next, failures: [...next.failures, { name: file.name, message }] };
				} else {
					next = { ...next, added: next.added + 1 };
					onInserted(file.name);
				}
			}
		} finally {
			// Runs even if something unexpected throws, so the drop zone can never stay stuck as busy.
			const overLimit = skipped.map((file) => ({ name: file.name, message: UPLOAD_MESSAGES.overLimit }));
			setReport({ ...next, failures: [...next.failures, ...overLimit] });
			setProgress(null);
		}
	}

	function handleChoose() {
		// The button stays focusable while busy (aria-disabled), so the click is ignored here instead.
		if (!isBusy) inputRef.current?.click();
	}

	function handleChange(event: ChangeEvent<HTMLInputElement>) {
		const files = Array.from(event.target.files ?? []);
		// Cleared so that choosing the same file again still fires a change.
		event.target.value = "";
		void handleFiles(files);
	}

	function handleDragEnter(event: DragEvent<HTMLDivElement>) {
		if (!hasFiles(event)) return;
		event.preventDefault();
		dragDepth.current += 1;
		setIsDragging(true);
	}

	function handleDragOver(event: DragEvent<HTMLDivElement>) {
		// Without this the browser would navigate away to the dropped file.
		if (hasFiles(event)) event.preventDefault();
	}

	function handleDragLeave() {
		dragDepth.current = Math.max(0, dragDepth.current - 1);
		if (dragDepth.current === 0) setIsDragging(false);
	}

	function handleDrop(event: DragEvent<HTMLDivElement>) {
		if (!hasFiles(event)) return;
		event.preventDefault();
		dragDepth.current = 0;
		setIsDragging(false);
		void handleFiles(Array.from(event.dataTransfer.files));
	}

	const progressLabel = progress ? `Adding ${progress.done + 1} of ${progress.total}…` : null;
	const zoneLabel = progressLabel ?? (isDragging ? "Drop to add to the canvas" : "Choose images or drop them here");

	return (
		<div
			className="flex min-h-full flex-col gap-3 p-3"
			onDragEnter={handleDragEnter}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
			<input ref={inputRef} type="file" accept={UPLOAD_ACCEPT} multiple hidden tabIndex={-1} onChange={handleChange} />
			<button
				type="button"
				aria-describedby={hintId}
				aria-disabled={isBusy}
				onClick={handleChoose}
				className={cn(
					"flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-md border border-dashed border-input px-4 py-8 text-center hover:bg-accent",
					isDragging && "border-solid border-grid/60 bg-grid-tint",
					isBusy && "cursor-progress",
				)}
			>
				{isBusy ? (
					<Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
				) : (
					<ImageUp className="size-5 text-muted-foreground" aria-hidden="true" />
				)}
				<span className="text-sm font-semibold text-foreground">{zoneLabel}</span>
				<span className="text-xs text-muted-foreground">
					SVG up to {formatBytes(MAX_SVG_BYTES)}. PNG, JPEG, WebP or GIF up to {formatBytes(MAX_RASTER_BYTES)}.
				</span>
			</button>

			<div id={hintId} className="space-y-1 text-xs text-muted-foreground">
				<p>Images are read in your browser and stored in the sketch. Nothing is uploaded to a server.</p>
				<p>
					Animated GIFs are added as a still image. Large pictures are scaled down to {MAX_EMBEDDED_IMAGE_DIMENSION} pixels.
				</p>
			</div>

			<UploadStatus progressLabel={progressLabel} report={report} />
		</div>
	);
}
