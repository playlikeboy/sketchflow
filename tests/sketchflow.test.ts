import { expect, test } from "bun:test";

import { isSafeLibrarySource } from "../src/lib/excalidraw-libraries";
import { humanizeSlug, normalizeScene, notesFilePath, projectFilePath, sketchFilePath, slugify } from "../src/lib/sketchflow";
import { workspaceConflictUpdate } from "../src/server/db/workspace-upsert";

test("slugify produces safe path segments", () => {
  expect(slugify("  My First Project! ")).toBe("my-first-project");
  expect(slugify("a/b\\c")).toBe("a-b-c");
  expect(slugify("???")).toBe("untitled");
});

test("humanizeSlug title-cases separators", () => {
  expect(humanizeSlug("system-map_v2")).toBe("System Map V2");
});

test("path helpers stay inside the project folder", () => {
  expect(projectFilePath("demo")).toBe("projects/demo/project.json");
  expect(sketchFilePath("demo", "map")).toBe("projects/demo/sketches/map.excalidraw.json");
  expect(notesFilePath("demo")).toBe("projects/demo/docs/notes.md");
});

test("normalizeScene repairs partial scenes", () => {
  const scene = normalizeScene({ elements: "broken" as unknown as unknown[], appState: { zoom: 2 } });
  expect(scene.type).toBe("excalidraw");
  expect(scene.elements).toEqual([]);
  expect(scene.appState).toEqual({ viewBackgroundColor: "#000000", zoom: 2 });
  expect(normalizeScene(null).files).toEqual({});
});

test("library sources cannot escape the library folder", () => {
  expect(isSafeLibrarySource("author/pack.excalidrawlib")).toBe(true);
  expect(isSafeLibrarySource("../secrets.excalidrawlib")).toBe(false);
  expect(isSafeLibrarySource("author/pack.json")).toBe(false);
  expect(isSafeLibrarySource("https://evil.example/x.excalidrawlib")).toBe(false);
});

test("a partial workspace update only touches the fields it was given", () => {
  expect(workspaceConflictUpdate({ repoOwner: "me", repoName: "ws", visibility: "private" })).toEqual({
    visibility: "private",
  });
  expect(workspaceConflictUpdate({ repoOwner: "me", repoName: "ws" })).toEqual({});
  expect(workspaceConflictUpdate({ repoOwner: "me", repoName: "ws", defaultBranch: "trunk" })).toEqual({
    defaultBranch: "trunk",
  });
});
