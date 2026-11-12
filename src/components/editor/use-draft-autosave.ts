"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import { createDraftAutosave, type AutosaveKind, type DraftAutosave } from "@/lib/draft-autosave";

type WriteDraft<T> = (key: string, value: T, isEdit: boolean) => void | Promise<void>;

export type DraftAutosaveControls<T> = Pick<DraftAutosave<T>, "queue" | "flush" | "cancel">;

/**
 * Saves work to this browser automatically (see src/lib/draft-autosave.ts for the timing).
 * Whatever is still pending is written when the tab is hidden, closed or reloaded, and when
 * the editor unmounts, so the last moment of work is not lost.
 *
 * `write` may be a new function on every render; the latest one is always used.
 */
export function useDraftAutosave<T>(write: WriteDraft<T>): DraftAutosaveControls<T> {
	const writeRef = useRef(write);
	const schedulerRef = useRef<DraftAutosave<T> | null>(null);

	useEffect(() => {
		writeRef.current = write;
	}, [write]);

	const queue = useCallback((key: string, value: T, kind: AutosaveKind) => {
		schedulerRef.current ??= createDraftAutosave<T>({
			write: (draftKey, draftValue, isEdit) => writeRef.current(draftKey, draftValue, isEdit),
		});
		schedulerRef.current.queue(key, value, kind);
	}, []);
	const flush = useCallback(() => schedulerRef.current?.flush(), []);
	const cancel = useCallback(() => schedulerRef.current?.cancel(), []);

	useEffect(() => {
		const flushWhenHidden = () => {
			if (document.visibilityState === "hidden") flush();
		};

		window.addEventListener("pagehide", flush);
		document.addEventListener("visibilitychange", flushWhenHidden);
		return () => {
			window.removeEventListener("pagehide", flush);
			document.removeEventListener("visibilitychange", flushWhenHidden);
			flush();
		};
	}, [flush]);

	return useMemo(() => ({ queue, flush, cancel }), [queue, flush, cancel]);
}
