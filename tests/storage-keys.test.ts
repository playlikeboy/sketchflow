import { expect, test } from "bun:test";

import {
  draftKey,
  legacyUnscopedKey,
  offlineCommitsKey,
  projectDraftPrefix,
  scopePrefixes,
  workspacesKey,
} from "../src/lib/storage-keys";

test("signed-in keys are scoped to the user", () => {
  expect(draftKey("ws", "proj", "map", "user-1")).toBe("sketchflow:user-1:ws:proj:map");
  expect(offlineCommitsKey("ws", "proj", "user-1")).toBe("offline-commits:user-1:ws:proj");
});

test("signed-out keys use the explicit local scope, never an unscoped key", () => {
  expect(draftKey("ws", "proj", "map")).toBe("sketchflow:local:ws:proj:map");
  expect(draftKey("ws", "proj", "map", null)).toBe("sketchflow:local:ws:proj:map");
  expect(workspacesKey()).toBe("workspaces:local");
});

test("a project purge prefix cannot match another user's drafts", () => {
  const prefix = projectDraftPrefix("ws", "proj", "user-1");
  expect(draftKey("ws", "proj", "map", "user-1").startsWith(prefix)).toBe(true);
  expect(`${draftKey("ws", "proj", "map", "user-1")}:notes`.startsWith(prefix)).toBe(true);
  expect(draftKey("ws", "proj", "map", "user-2").startsWith(prefix)).toBe(false);
  expect(draftKey("ws", "proj", "map").startsWith(prefix)).toBe(false);
  expect(draftKey("ws", "project-2", "map", "user-1").startsWith(prefix)).toBe(false);
});

test("a user purge covers that user's keys only", () => {
  const prefixes = scopePrefixes("user-1");
  const matches = (key: string) => prefixes.some((prefix) => key.startsWith(prefix));
  expect(matches(draftKey("ws", "proj", "map", "user-1"))).toBe(true);
  expect(matches(offlineCommitsKey("ws", "proj", "user-1"))).toBe(true);
  expect(matches(draftKey("ws", "proj", "map", "user-10"))).toBe(false);
  expect(matches(draftKey("ws", "proj", "map"))).toBe(false);
});

test("maps local keys to the unscoped keys older builds wrote", () => {
  expect(legacyUnscopedKey("sketchflow:local:ws:proj:map:notes")).toBe("sketchflow:ws:proj:map:notes");
  expect(legacyUnscopedKey("offline-commits:local:ws:proj")).toBe("offline-commits:ws:proj");
  expect(legacyUnscopedKey("workspaces:local")).toBe("workspaces:default");
  expect(legacyUnscopedKey("sketchflow:user-1:ws:proj:map")).toBeNull();
  expect(legacyUnscopedKey("settings:offline-mode")).toBeNull();
});
