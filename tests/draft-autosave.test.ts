import { expect, test } from "bun:test";

import { createDraftAutosave } from "../src/lib/draft-autosave";

type Write = { key: string; value: string; isEdit: boolean };

/** A clock and timer the test advances by hand. */
function harness() {
	let time = 0;
	let nextId = 1;
	const timers = new Map<number, { at: number; callback: () => void }>();
	const writes: Write[] = [];

	const autosave = createDraftAutosave<string>({
		write: (key, value, isEdit) => {
			writes.push({ key, value, isEdit });
		},
		editDelayMs: 300,
		viewDelayMs: 1_500,
		maxWaitMs: 2_000,
		now: () => time,
		setTimer: (callback, delayMs) => {
			const id = nextId;
			nextId += 1;
			timers.set(id, { at: time + delayMs, callback });
			return id;
		},
		clearTimer: (id) => {
			timers.delete(id as number);
		},
	});

	function advance(ms: number) {
		const end = time + ms;
		for (;;) {
			const due = [...timers].filter(([, timer]) => timer.at <= end).sort((left, right) => left[1].at - right[1].at)[0];
			if (!due) break;
			time = due[1].at;
			timers.delete(due[0]);
			due[1].callback();
		}
		time = end;
	}

	return { autosave, writes, advance };
}

test("writes an edit shortly after the person stops", () => {
	const { autosave, writes, advance } = harness();

	autosave.queue("sketch", "one stroke", "edit");
	advance(299);
	expect(writes).toHaveLength(0);
	advance(1);

	expect(writes).toEqual([{ key: "sketch", value: "one stroke", isEdit: true }]);
	expect(autosave.hasPending()).toBe(false);
});

test("writes only the latest value when edits arrive in a burst", () => {
	const { autosave, writes, advance } = harness();

	autosave.queue("sketch", "a", "edit");
	advance(100);
	autosave.queue("sketch", "ab", "edit");
	advance(100);
	autosave.queue("sketch", "abc", "edit");
	advance(300);

	expect(writes).toEqual([{ key: "sketch", value: "abc", isEdit: true }]);
});

test("still writes during a long continuous edit, without waiting for it to end", () => {
	const { autosave, writes, advance } = harness();

	// A freehand stroke reporting a change every 100ms for three seconds.
	for (let step = 0; step < 30; step += 1) {
		autosave.queue("sketch", `point ${step}`, "edit");
		advance(100);
	}

	expect(writes.length).toBeGreaterThanOrEqual(1);
	expect(writes[0].value).toBe("point 20");
});

test("saves a scroll or selection lazily, and marks it as not an edit", () => {
	const { autosave, writes, advance } = harness();

	autosave.queue("sketch", "scrolled", "view");
	advance(1_499);
	expect(writes).toHaveLength(0);
	advance(1);

	expect(writes).toEqual([{ key: "sketch", value: "scrolled", isEdit: false }]);
});

test("scrolling does not postpone an edit that is waiting to be written", () => {
	const { autosave, writes, advance } = harness();

	autosave.queue("sketch", "edited", "edit");
	advance(200);
	autosave.queue("sketch", "edited, then scrolled", "view");
	advance(100);

	// Written on the edit's schedule, with the newest value, still counted as an edit.
	expect(writes).toEqual([{ key: "sketch", value: "edited, then scrolled", isEdit: true }]);
});

test("continuous scrolling is written once per lazy interval, not on every move", () => {
	const { autosave, writes, advance } = harness();

	for (let step = 0; step < 30; step += 1) {
		autosave.queue("sketch", `scroll ${step}`, "view");
		advance(100);
	}

	expect(writes).toHaveLength(2);
});

test("flush writes the pending value immediately and only once", () => {
	const { autosave, writes, advance } = harness();

	autosave.queue("sketch", "about to close the tab", "edit");
	autosave.flush();
	advance(5_000);

	expect(writes).toEqual([{ key: "sketch", value: "about to close the tab", isEdit: true }]);
});

test("flush with nothing pending writes nothing", () => {
	const { autosave, writes } = harness();

	autosave.flush();

	expect(writes).toHaveLength(0);
});

test("cancel drops the pending value", () => {
	const { autosave, writes, advance } = harness();

	autosave.queue("sketch", "discarded", "edit");
	autosave.cancel();
	advance(5_000);

	expect(writes).toHaveLength(0);
	expect(autosave.hasPending()).toBe(false);
});

test("moving to another sketch writes the first one under its own key", () => {
	const { autosave, writes, advance } = harness();

	autosave.queue("sketch-a", "work on a", "edit");
	autosave.queue("sketch-b", "work on b", "edit");
	advance(300);

	expect(writes).toEqual([
		{ key: "sketch-a", value: "work on a", isEdit: true },
		{ key: "sketch-b", value: "work on b", isEdit: true },
	]);
});
