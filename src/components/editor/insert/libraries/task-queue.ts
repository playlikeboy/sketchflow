// A small work queue that runs a limited number of async tasks at a time and gives the
// browser a turn before each one. No DOM or React import, so it runs in tests.

export type TaskQueueOptions = {
	/** How many tasks may run at the same time. */
	concurrency: number;
	/** Awaited before each task starts, to let the browser paint and handle input. */
	pause?: () => Promise<void>;
	/** Told about a task that threw. The queue keeps going either way. */
	onError?: (error: unknown) => void;
};

export type TaskQueue = {
	/** Adds a task. The returned function withdraws it if it has not started yet. */
	enqueue: (task: () => Promise<void>) => () => void;
};

type Entry = { task: () => Promise<void> };

export function createTaskQueue({ concurrency, pause, onError }: TaskQueueOptions): TaskQueue {
	const limit = Math.max(1, Math.floor(concurrency));
	const withdrawn = new WeakSet<Entry>();
	let waiting: readonly Entry[] = [];
	let running = 0;

	const run = async (entry: Entry) => {
		try {
			await pause?.();
			// Withdrawn while the browser had its turn: skip the work.
			if (!withdrawn.has(entry)) {
				await entry.task();
			}
		} catch (error) {
			onError?.(error);
		} finally {
			running -= 1;
			startWaiting();
		}
	};

	function startWaiting() {
		while (running < limit && waiting.length > 0) {
			const [next, ...rest] = waiting;
			waiting = rest;
			running += 1;
			void run(next);
		}
	}

	return {
		enqueue(task) {
			const entry: Entry = { task };
			waiting = [...waiting, entry];
			startWaiting();
			return () => {
				withdrawn.add(entry);
				waiting = waiting.filter((candidate) => candidate !== entry);
			};
		},
	};
}
