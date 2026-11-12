"use client";

import { ImageOff, Loader2, Plus, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import useSWRInfinite from "swr/infinite";

import type { InsertTabProps } from "@/components/editor/insert/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { insertImage, rasterToImage } from "@/lib/canvas-insert";
import {
	UNSPLASH_HOME_URL,
	UNSPLASH_MAX_PAGE,
	UNSPLASH_MAX_QUERY_LENGTH,
	UnsplashRequestError,
	arrangeInColumns,
	fetchUnsplashPhotoBlob,
	fetchUnsplashPhotos,
	normalizeUnsplashQuery,
	reportUnsplashDownload,
	type UnsplashFailureKind,
	type UnsplashPhoto,
	type UnsplashSearchResponse,
} from "@/lib/unsplash";
import { cn } from "@/lib/utils";

const SEARCH_DEBOUNCE_MS = 400;
const PHOTO_INSERT_SIZE = 480;
const COLUMN_COUNT = 2;
const SKELETON_HEIGHTS = ["h-28", "h-40", "h-36", "h-24", "h-32", "h-44"];

type SearchKey = readonly ["unsplash-search", string, number];

function useDebouncedValue<T>(value: T, delayMs: number) {
	const [debounced, setDebounced] = useState(value);

	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(timer);
	}, [value, delayMs]);

	return debounced;
}

function toSearchText(query: string) {
	return normalizeUnsplashQuery(query).slice(0, UNSPLASH_MAX_QUERY_LENGTH).trim();
}

function isOffline() {
	return typeof navigator !== "undefined" && !navigator.onLine;
}

function searchFailureMessage(kind: UnsplashFailureKind) {
	if (kind === "not_configured") return "Photo search isn't set up on this server.";
	if (kind === "rate_limited") return "Photo search is busy. Try again in a few minutes.";
	if (isOffline()) return "You're offline. Photo search needs a connection.";
	return "Photos couldn't be loaded.";
}

function uniqueById(photos: readonly UnsplashPhoto[]) {
	return [...new Map(photos.map((photo) => [photo.id, photo])).values()];
}

function usePhotoSearch(searchText: string) {
	const { data, error, size, setSize, isLoading, isValidating, mutate } = useSWRInfinite<UnsplashSearchResponse, unknown>(
		(index: number, previous: UnsplashSearchResponse | null): SearchKey | null => {
			const isPastTheEnd = previous !== null && index >= Math.min(previous.totalPages, UNSPLASH_MAX_PAGE);
			return isPastTheEnd ? null : ["unsplash-search", searchText, index + 1];
		},
		([, query, page]: SearchKey) => fetchUnsplashPhotos({ query, page }),
		{
			// Results are cached for an hour upstream and the Unsplash budget is small: never refetch unprompted.
			revalidateOnFocus: false,
			revalidateOnReconnect: false,
			revalidateIfStale: false,
			revalidateFirstPage: false,
			shouldRetryOnError: false,
		},
	);

	const pages = data ?? [];
	const photos = uniqueById(pages.flatMap((page) => page.photos));
	const totalPages = Math.min(pages[0]?.totalPages ?? 0, UNSPLASH_MAX_PAGE);
	const failure: UnsplashFailureKind | null = error ? (error instanceof UnsplashRequestError ? error.kind : "failed") : null;

	return {
		photos,
		failure,
		isLoadingFirstPage: isLoading && pages.length === 0,
		isLoadingMore: isValidating && pages.length > 0 && pages.length < size,
		hasMore: failure === null && pages.length > 0 && pages.length < totalPages,
		loadMore: () => void setSize(pages.length + 1),
		// With pages already shown, only the missing page is fetched again; otherwise start over.
		retry: () => void (pages.length > 0 ? setSize(size) : mutate()),
	};
}

type PhotoTileProps = {
	photo: UnsplashPhoto;
	isBusy: boolean;
	isDisabled: boolean;
	errorMessage: string | null;
	onInsert: (photo: UnsplashPhoto) => void;
};

function PhotoTile({ photo, isBusy, isDisabled, errorMessage, onInsert }: PhotoTileProps) {
	const label = photo.description || `Photo by ${photo.photographerName}`;

	return (
		<figure className="min-w-0">
			<button
				type="button"
				onClick={() => onInsert(photo)}
				// aria-disabled rather than disabled, so the tile being added keeps keyboard focus.
				aria-disabled={isDisabled}
				aria-busy={isBusy}
				aria-label={`Add to canvas: ${label}`}
				title="Add to canvas"
				className={cn(
					"group relative block w-full overflow-hidden rounded-md border border-rule",
					isDisabled ? "cursor-default" : "cursor-pointer",
				)}
				style={{ aspectRatio: `${photo.width} / ${photo.height}`, backgroundColor: photo.color }}
			>
				{/* eslint-disable-next-line @next/next/no-img-element -- Unsplash requires hotlinking its own image URLs */}
				<img
					src={photo.thumbUrl}
					alt={photo.description}
					loading="lazy"
					decoding="async"
					width={photo.width}
					height={photo.height}
					className={cn("size-full object-cover transition-opacity duration-150", isBusy && "opacity-40")}
				/>
				<span
					aria-hidden="true"
					className={cn(
						"absolute inset-0 grid place-items-center bg-black/35 text-white opacity-0 transition-opacity duration-150",
						isBusy && "opacity-100",
						!isDisabled && "group-hover:opacity-100 group-focus-visible:opacity-100",
					)}
				>
					{isBusy ? <Loader2 className="size-5 animate-spin motion-reduce:animate-none" /> : <Plus className="size-5" />}
				</span>
			</button>
			<figcaption className="mt-1 truncate text-[0.6875rem] leading-4 text-muted-foreground">
				Photo by{" "}
				<a
					href={photo.photographerUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="font-semibold text-foreground underline-offset-2 hover:underline"
				>
					{photo.photographerName}
				</a>
			</figcaption>
			{errorMessage ? (
				<p role="alert" className="mt-0.5 text-[0.6875rem] leading-4 text-destructive">
					{errorMessage}
				</p>
			) : null}
		</figure>
	);
}

function PhotoGridSkeleton() {
	const columns = [SKELETON_HEIGHTS.filter((_, index) => index % 2 === 0), SKELETON_HEIGHTS.filter((_, index) => index % 2 === 1)];

	return (
		<div role="status" aria-label="Loading photos" className="grid grid-cols-2 gap-2 p-3">
			{columns.map((heights, columnIndex) => (
				<div key={columnIndex} className="flex flex-col gap-2">
					{heights.map((height) => (
						<Skeleton key={height} className={cn("w-full motion-reduce:animate-none", height)} />
					))}
				</div>
			))}
		</div>
	);
}

function Notice({ message, onRetry }: { message: string; onRetry?: () => void }) {
	return (
		<div role="alert" className="flex flex-col items-start gap-2 p-4 text-sm text-muted-foreground">
			<ImageOff className="size-5" aria-hidden="true" />
			<p>{message}</p>
			{onRetry ? (
				<Button variant="outline" size="sm" onClick={onRetry}>
					<RefreshCw />
					Retry
				</Button>
			) : null}
		</div>
	);
}

function UnsplashCredit() {
	return (
		<p className="border-t border-rule px-3 py-2 text-[0.6875rem] leading-4 text-muted-foreground">
			Photos from{" "}
			<a
				href={UNSPLASH_HOME_URL}
				target="_blank"
				rel="noopener noreferrer"
				className="font-semibold text-foreground underline-offset-2 hover:underline"
			>
				Unsplash
			</a>
		</p>
	);
}

/** Searches Unsplash and places the chosen photo on the canvas, credited and downscaled. */
export function PhotosTab({ api, query, onInserted }: InsertTabProps) {
	const typedSearch = toSearchText(query);
	const searchText = useDebouncedValue(typedSearch, SEARCH_DEBOUNCE_MS);
	const search = usePhotoSearch(searchText);
	const [busyPhotoId, setBusyPhotoId] = useState<string | null>(null);
	const [insertFailure, setInsertFailure] = useState<{ photoId: string; message: string } | null>(null);
	const isWaitingToSearch = typedSearch !== searchText;

	async function handleInsert(photo: UnsplashPhoto) {
		if (busyPhotoId) return;
		setBusyPhotoId(photo.id);
		setInsertFailure(null);

		try {
			const blob = await fetchUnsplashPhotoBlob(photo);
			const image = await rasterToImage(blob);
			await insertImage(api, { ...image, targetSize: PHOTO_INSERT_SIZE, link: photo.photoPageUrl });
			reportUnsplashDownload(photo.downloadLocation);
			onInserted(`photo by ${photo.photographerName}`);
		} catch {
			const message = isOffline() ? "You're offline. Reconnect to add this photo." : "This photo couldn't be added. Try again.";
			setInsertFailure({ photoId: photo.id, message });
		} finally {
			setBusyPhotoId(null);
		}
	}

	if (search.failure === "not_configured") {
		return <Notice message={searchFailureMessage("not_configured")} />;
	}

	if (search.isLoadingFirstPage || (isWaitingToSearch && search.photos.length === 0 && !search.failure)) {
		return <PhotoGridSkeleton />;
	}

	if (search.photos.length === 0) {
		if (search.failure) {
			return <Notice message={searchFailureMessage(search.failure)} onRetry={search.retry} />;
		}
		const emptyMessage = searchText ? `No photos found for "${searchText}". Try a different search.` : "No photos to show right now.";
		return <p className="p-4 text-sm text-muted-foreground">{emptyMessage}</p>;
	}

	const columns = arrangeInColumns(search.photos, COLUMN_COUNT);

	return (
		<div className="flex min-h-full flex-col">
			<div className={cn("grid grid-cols-2 gap-2 p-3 transition-opacity", isWaitingToSearch && "opacity-60")} aria-busy={isWaitingToSearch}>
				{columns.map((column, columnIndex) => (
					<div key={columnIndex} className="flex min-w-0 flex-col gap-2.5">
						{column.map((photo) => (
							<PhotoTile
								key={photo.id}
								photo={photo}
								isBusy={busyPhotoId === photo.id}
								isDisabled={busyPhotoId !== null}
								errorMessage={insertFailure?.photoId === photo.id ? insertFailure.message : null}
								onInsert={handleInsert}
							/>
						))}
					</div>
				))}
			</div>

			<div className="flex flex-col items-start gap-2 px-3 pb-3">
				{search.failure ? (
					<p role="alert" className="text-xs text-muted-foreground">
						{searchFailureMessage(search.failure)}
					</p>
				) : null}
				{search.failure ? (
					<Button variant="outline" size="sm" onClick={search.retry}>
						<RefreshCw />
						Retry
					</Button>
				) : null}
				{search.hasMore || search.isLoadingMore ? (
					<Button variant="outline" size="sm" onClick={search.loadMore} disabled={search.isLoadingMore} className="w-full">
						{search.isLoadingMore ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
						{search.isLoadingMore ? "Loading more photos" : "Load more"}
					</Button>
				) : null}
			</div>

			<div className="mt-auto">
				<UnsplashCredit />
			</div>
		</div>
	);
}
