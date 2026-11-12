// Schedules writes of work-in-progress to this browser's storage.
//
// Every change is saved locally without anyone asking, and the editor must stay smooth while
// that happens. So:
//   - an edit is written shortly after the person pauses, and at least every `maxWaitMs` while
//     they keep going (a long freehand stroke never waits for the end of the stroke);
//   - a change that is only a scroll, zoom or selection is written lazily, and never pushes
//     back a write that is already scheduled;
//   - `flush()` writes whatever is pending immediately, for when the page is being hidden or
//     the editor is going away.
//
// No React and no storage here: the caller supplies `write`, so this is unit-testable.

export type AutosaveKind = "edit" | "view";

export type DraftAutosaveOptions<T> = {
	/** Persists one value. `isEdit` is false when only the view (scroll, zoom, selection) changed. */
	write: (key: string, value: T, isEdit: boolean) => void | Promise<void>;
	/** How long after the last edit to write. */
	editDelayMs?: number;
	/** How long after a view-only change to write. */
	viewDelayMs?: number;
	/** The longest an edit may stay unwritten while changes keep arriving. */
	maxWaitMs?: number;
	now?: () => number;
	setTimer?: (callback: () => void, delayMs: number) => unknown;
	clearTimer?: (timer: unknown) => void;
};

export type DraftAutosave<T> = {
	/** Records the latest value for `key` and schedules it to be written. */
	queue: (key: string, value: T, kind: AutosaveKind) => void;
	/** Writes the pending value now, if there is one. */
	flush: () => void;
	/** Drops the pending value without writing it. */
	cancel: () => void;
	hasPending: () => boolean;
};

export const DEFAULT_EDIT_DELAY_MS = 300;
export const DEFAULT_VIEW_DELAY_MS = 1_500;
export const DEFAULT_MAX_WAIT_MS = 2_000;

type Pending<T> = { key: string; value: T; isEdit: boolean; queuedAt: number };

export function createDraftAutosave<T>(options: DraftAutosaveOptions<T>): DraftAutosave<T> {
	const editDelayMs = options.editDelayMs ?? DEFAULT_EDIT_DELAY_MS;
	const viewDelayMs = options.viewDelayMs ?? DEFAULT_VIEW_DELAY_MS;
	const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
	const now = options.now ?? Date.now;
	const setTimer = options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
	const clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));

	let pending: Pending<T> | null = null;
	let timer: unknown = null;

	function stopTimer() {
		if (timer !== null) {
			clearTimer(timer);
			timer = null;
		}
	}

	function flush() {
		stopTimer();
		const toWrite = pending;
		pending = null;
		if (toWrite) {
			void options.write(toWrite.key, toWrite.value, toWrite.isEdit);
		}
	}

	function cancel() {
		stopTimer();
		pending = null;
	}

	function queue(key: string, value: T, kind: AutosaveKind) {
		// A value for another sketch must not be lost or written under the wrong key.
		if (pending && pending.key !== key) {
			flush();
		}

		const isEdit = kind === "edit" || (pending?.isEdit ?? false);
		pending = { key, value, isEdit, queuedAt: pending?.queuedAt ?? now() };

		// Scrolling or selecting never postpones a write that is already on its way.
		if (kind === "view" && timer !== null) {
			return;
		}

		if (now() - pending.queuedAt >= maxWaitMs) {
			flush();
			return;
		}

		stopTimer();
		timer = setTimer(flush, kind === "edit" ? editDelayMs : viewDelayMs);
	}

	return { queue, flush, cancel, hasPending: () => pending !== null };
}
