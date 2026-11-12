import { describe, expect, test } from "bun:test";

import { matchesQuery, splitPacks } from "../src/components/editor/insert/libraries/pack-filter";
import { createTaskQueue } from "../src/components/editor/insert/libraries/task-queue";
import { normalizeExcalidrawLibrary, type ExcalidrawLibrary } from "../src/lib/excalidraw-libraries";
import {
	MAX_SAVED_PACKS,
	SAVED_PACKS_KEY,
	createLibraryStore,
	normalizeSavedPacks,
	removeSavedPack,
	touchSavedPack,
	type SavedPack,
	type StoredSavedPacks,
} from "../src/lib/library-store";
import { legacyUnscopedKey, scopePrefixes } from "../src/lib/storage-keys";

const pack = (name: string, lastUsedAt: number): SavedPack => ({ source: `author/${name}.excalidrawlib`, name, lastUsedAt });

function memoryStorage(initial: unknown = null) {
	const state = { value: initial, writes: 0 };
	return {
		state,
		storage: {
			read: async () => state.value,
			write: async (value: StoredSavedPacks) => {
				state.value = value;
				state.writes += 1;
			},
		},
	};
}

describe("saved packs key", () => {
	test("is one device-wide key with no user, workspace or sketch in it", () => {
		expect(SAVED_PACKS_KEY).toBe("library-packs:local");
	});

	test("is not removed when a user's cache is purged, and has no legacy key to migrate", () => {
		expect(scopePrefixes("user-1").some((prefix) => SAVED_PACKS_KEY.startsWith(prefix))).toBe(false);
		expect(scopePrefixes("local").some((prefix) => SAVED_PACKS_KEY.startsWith(prefix))).toBe(false);
		expect(legacyUnscopedKey(SAVED_PACKS_KEY)).toBeNull();
	});
});

describe("normalizeSavedPacks", () => {
	test("returns an empty list for missing or malformed storage", () => {
		expect(normalizeSavedPacks(null)).toEqual([]);
		expect(normalizeSavedPacks("nonsense")).toEqual([]);
		expect(normalizeSavedPacks({ version: 1, packs: "nope" })).toEqual([]);
	});

	test("drops entries with an unsafe source or a missing time", () => {
		const stored = {
			version: 1,
			packs: [
				pack("good", 5),
				{ source: "../secrets.excalidrawlib", name: "bad path", lastUsedAt: 4 },
				{ source: "https://example.com/x.excalidrawlib", name: "bad url", lastUsedAt: 4 },
				{ source: "author/no-time.excalidrawlib", name: "no time" },
				{ source: "author/nan.excalidrawlib", name: "nan", lastUsedAt: Number.NaN },
				null,
				42,
			],
		};

		expect(normalizeSavedPacks(stored)).toEqual([pack("good", 5)]);
	});

	test("orders most recently used first", () => {
		const stored = { version: 1, packs: [pack("old", 1), pack("new", 3), pack("middle", 2)] };

		expect(normalizeSavedPacks(stored).map((entry) => entry.name)).toEqual(["new", "middle", "old"]);
	});

	test("keeps one entry per pack, the most recent", () => {
		const stored = { version: 1, packs: [pack("aws", 1), pack("aws", 9), pack("uml", 4)] };

		expect(normalizeSavedPacks(stored)).toEqual([pack("aws", 9), pack("uml", 4)]);
	});

	test("falls back to the source when the name is blank", () => {
		const stored = { version: 1, packs: [{ source: "author/blank.excalidrawlib", name: "   ", lastUsedAt: 1 }] };

		expect(normalizeSavedPacks(stored)[0].name).toBe("author/blank.excalidrawlib");
	});

	test("caps the list, dropping the least recently used", () => {
		const many = Array.from({ length: MAX_SAVED_PACKS + 5 }, (_, index) => pack(`pack-${index}`, index));

		const result = normalizeSavedPacks({ version: 1, packs: many });

		expect(result).toHaveLength(MAX_SAVED_PACKS);
		expect(result[0].name).toBe(`pack-${MAX_SAVED_PACKS + 4}`);
		expect(result.at(-1)?.name).toBe("pack-5");
	});
});

describe("touchSavedPack", () => {
	test("adds a new pack at the front without changing the input", () => {
		const before = [pack("uml", 1)];

		const after = touchSavedPack(before, { source: "author/aws.excalidrawlib", name: "aws" }, 10);

		expect(after).toEqual([pack("aws", 10), pack("uml", 1)]);
		expect(before).toEqual([pack("uml", 1)]);
	});

	test("moves an existing pack to the front instead of duplicating it", () => {
		const before = [pack("uml", 5), pack("aws", 1)];

		const after = touchSavedPack(before, { source: "author/aws.excalidrawlib", name: "AWS icons" }, 10);

		expect(after).toEqual([{ source: "author/aws.excalidrawlib", name: "AWS icons", lastUsedAt: 10 }, pack("uml", 5)]);
	});

	test("ignores a pack with an unsafe source", () => {
		const before = [pack("uml", 1)];

		expect(touchSavedPack(before, { source: "../../etc/passwd", name: "x" }, 10)).toEqual(before);
	});

	test("evicts the least recently used pack once the list is full", () => {
		const full = Array.from({ length: MAX_SAVED_PACKS }, (_, index) => pack(`pack-${index}`, index + 1));

		const after = touchSavedPack(full, { source: "author/fresh.excalidrawlib", name: "fresh" }, 1000);

		expect(after).toHaveLength(MAX_SAVED_PACKS);
		expect(after[0].name).toBe("fresh");
		expect(after.some((entry) => entry.name === "pack-0")).toBe(false);
	});
});

describe("removeSavedPack", () => {
	test("removes only the named pack without changing the input", () => {
		const before = [pack("aws", 2), pack("uml", 1)];

		expect(removeSavedPack(before, "author/aws.excalidrawlib")).toEqual([pack("uml", 1)]);
		expect(before).toHaveLength(2);
	});
});

describe("createLibraryStore", () => {
	test("lists nothing when storage is empty", async () => {
		const { storage } = memoryStorage();

		expect(await createLibraryStore(storage).list()).toEqual([]);
	});

	test("touch writes the new list and resolves with it", async () => {
		const { storage, state } = memoryStorage({ version: 1, packs: [pack("uml", 1)] });
		const store = createLibraryStore(storage, () => 50);

		const result = await store.touch({ source: "author/aws.excalidrawlib", name: "aws" });

		expect(result).toEqual([pack("aws", 50), pack("uml", 1)]);
		expect(state.value).toEqual({ version: 1, packs: result });
		expect(await store.list()).toEqual(result);
	});

	test("remove writes the list without that pack", async () => {
		const { storage, state } = memoryStorage({ version: 1, packs: [pack("aws", 2), pack("uml", 1)] });

		const result = await createLibraryStore(storage).remove("author/aws.excalidrawlib");

		expect(result).toEqual([pack("uml", 1)]);
		expect(state.value).toEqual({ version: 1, packs: [pack("uml", 1)] });
	});

	test("changes made at the same moment do not overwrite each other", async () => {
		const { storage } = memoryStorage();
		let clock = 0;
		const store = createLibraryStore(storage, () => (clock += 1));

		await Promise.all([
			store.touch({ source: "author/a.excalidrawlib", name: "a" }),
			store.touch({ source: "author/b.excalidrawlib", name: "b" }),
			store.touch({ source: "author/c.excalidrawlib", name: "c" }),
		]);

		expect((await store.list()).map((entry) => entry.name)).toEqual(["c", "b", "a"]);
	});

	test("keeps what another browser tab stored in the meantime", async () => {
		const { storage, state } = memoryStorage();
		const store = createLibraryStore(storage, () => 20);
		state.value = { version: 1, packs: [pack("from-other-tab", 10)] };

		const result = await store.touch({ source: "author/mine.excalidrawlib", name: "mine" });

		expect(result.map((entry) => entry.name)).toEqual(["mine", "from-other-tab"]);
	});

	test("a failed write rejects, and later changes still go through", async () => {
		const { storage, state } = memoryStorage();
		let failNext = true;
		const flaky = {
			read: storage.read,
			write: async (value: StoredSavedPacks) => {
				if (failNext) {
					failNext = false;
					throw new Error("storage is full");
				}
				await storage.write(value);
			},
		};
		const store = createLibraryStore(flaky, () => 1);

		await expect(store.touch({ source: "author/a.excalidrawlib", name: "a" })).rejects.toThrow("storage is full");
		await store.touch({ source: "author/b.excalidrawlib", name: "b" });

		expect(state.writes).toBe(1);
		expect((await store.list()).map((entry) => entry.name)).toEqual(["b"]);
	});
});

function library(name: string, extra: { description?: string; itemNames?: string[]; author?: string } = {}): ExcalidrawLibrary {
	const normalized = normalizeExcalidrawLibrary({
		name,
		source: `author/${name.toLowerCase().replace(/\s+/g, "-")}.excalidrawlib`,
		description: extra.description,
		itemNames: extra.itemNames,
		authors: extra.author ? [{ name: extra.author }] : [],
	});
	if (!normalized) throw new Error("test library is invalid");
	return normalized;
}

describe("matchesQuery", () => {
	test("an empty query matches everything", () => {
		expect(matchesQuery("anything", "")).toBe(true);
		expect(matchesQuery("anything", "   ")).toBe(true);
	});

	test("every word must appear, in any order and any letter case", () => {
		expect(matchesQuery("aws architecture icons", "Icons AWS")).toBe(true);
		expect(matchesQuery("aws architecture icons", "aws azure")).toBe(false);
	});
});

describe("splitPacks", () => {
	const catalog = [
		library("UML Shapes", { description: "Class and sequence diagrams" }),
		library("AWS Icons", { itemNames: ["Lambda", "EC2"], author: "Ada" }),
		library("Floor Plan", { description: "Furniture for a room" }),
	];
	const all = { query: "", audience: "all" as const };

	test("with nothing saved, lists every pack by name", () => {
		const { yours, others } = splitPacks(catalog, [], all);

		expect(yours).toEqual([]);
		expect(others.map((entry) => entry.name)).toEqual(["AWS Icons", "Floor Plan", "UML Shapes"]);
	});

	test("saved packs come first in most-recent order and are not repeated below", () => {
		const saved = [pack("uml-shapes", 9), pack("aws-icons", 3)];

		const { yours, others } = splitPacks(catalog, saved, all);

		expect(yours.map((entry) => entry.name)).toEqual(["UML Shapes", "AWS Icons"]);
		expect(others.map((entry) => entry.name)).toEqual(["Floor Plan"]);
	});

	test("searches the pack name, description, author and item names", () => {
		const names = (query: string) => splitPacks(catalog, [], { query, audience: "all" }).others.map((entry) => entry.name);

		expect(names("uml")).toEqual(["UML Shapes"]);
		expect(names("sequence")).toEqual(["UML Shapes"]);
		expect(names("ada")).toEqual(["AWS Icons"]);
		expect(names("lambda")).toEqual(["AWS Icons"]);
		expect(names("no such thing")).toEqual([]);
	});

	test("the search applies to saved packs too", () => {
		const saved = [pack("uml-shapes", 9), pack("aws-icons", 3)];

		const { yours } = splitPacks(catalog, saved, { query: "ec2", audience: "all" });

		expect(yours.map((entry) => entry.name)).toEqual(["AWS Icons"]);
	});

	test("filters both sections by subject", () => {
		const saved = [pack("floor-plan", 9), pack("aws-icons", 3)];

		const { yours, others } = splitPacks(catalog, saved, { query: "", audience: "devs" });

		expect(yours.map((entry) => entry.name)).toEqual(["AWS Icons"]);
		expect(others.map((entry) => entry.name)).toEqual(["UML Shapes"]);
	});

	test("a saved pack is still listed by its stored name while the catalog is unavailable", () => {
		const saved = [pack("aws-icons", 3)];

		const { yours } = splitPacks([], saved, all);

		expect(yours).toEqual([{ source: "author/aws-icons.excalidrawlib", name: "aws-icons", library: null }]);
		expect(splitPacks([], saved, { query: "", audience: "devs" }).yours).toEqual([]);
		expect(splitPacks([], saved, { query: "floor", audience: "all" }).yours).toEqual([]);
	});

	test("does not reorder the catalog it was given", () => {
		const before = catalog.map((entry) => entry.name);

		splitPacks(catalog, [], all);

		expect(catalog.map((entry) => entry.name)).toEqual(before);
	});
});

describe("createTaskQueue", () => {
	function deferred() {
		let release = () => {};
		const promise = new Promise<void>((resolve) => {
			release = resolve;
		});
		return { promise, release };
	}
	const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

	test("never runs more tasks at once than the limit, and runs them in order", async () => {
		const queue = createTaskQueue({ concurrency: 2 });
		const gates = [deferred(), deferred(), deferred(), deferred()];
		const started: number[] = [];
		let running = 0;
		let peak = 0;

		gates.forEach((gate, index) =>
			queue.enqueue(async () => {
				started.push(index);
				running += 1;
				peak = Math.max(peak, running);
				await gate.promise;
				running -= 1;
			}),
		);
		await settle();
		expect(started).toEqual([0, 1]);

		gates[0].release();
		await settle();
		expect(started).toEqual([0, 1, 2]);

		gates.slice(1).forEach((gate) => gate.release());
		await settle();
		expect(started).toEqual([0, 1, 2, 3]);
		expect(peak).toBe(2);
	});

	test("a withdrawn task that has not started never runs", async () => {
		const queue = createTaskQueue({ concurrency: 1 });
		const gate = deferred();
		const ran: string[] = [];

		queue.enqueue(async () => {
			ran.push("first");
			await gate.promise;
		});
		const withdraw = queue.enqueue(async () => {
			ran.push("second");
		});
		queue.enqueue(async () => {
			ran.push("third");
		});
		withdraw();
		gate.release();
		await settle();

		expect(ran).toEqual(["first", "third"]);
	});

	test("a task withdrawn during the pause before it is skipped", async () => {
		const pause = deferred();
		const queue = createTaskQueue({ concurrency: 1, pause: () => pause.promise });
		let ran = false;

		const withdraw = queue.enqueue(async () => {
			ran = true;
		});
		withdraw();
		pause.release();
		await settle();

		expect(ran).toBe(false);
	});

	test("pauses before every task", async () => {
		let pauses = 0;
		const queue = createTaskQueue({
			concurrency: 2,
			pause: async () => {
				pauses += 1;
			},
		});

		queue.enqueue(async () => {});
		queue.enqueue(async () => {});
		queue.enqueue(async () => {});
		await settle();

		expect(pauses).toBe(3);
	});

	test("a failing task is reported and does not stop the queue", async () => {
		const errors: unknown[] = [];
		const queue = createTaskQueue({ concurrency: 1, onError: (error) => errors.push(error) });
		let ranAfter = false;

		queue.enqueue(async () => {
			throw new Error("boom");
		});
		queue.enqueue(async () => {
			ranAfter = true;
		});
		await settle();

		expect(errors).toHaveLength(1);
		expect(ranAfter).toBe(true);
	});
});
