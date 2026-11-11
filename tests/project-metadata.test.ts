import { expect, test } from "bun:test";

import {
  buildProjectsMetadata,
  mergeProjectsMetadata,
  normalizeProjectsMetadata,
  projectFromProjectJson,
} from "../src/lib/project-metadata";

const NOW = "2026-01-01T00:00:00.000Z";

test("fills defaults when project.json is missing or malformed", () => {
  for (const projectJson of [null, "not an object", [], 42]) {
    const project = projectFromProjectJson({ projectId: "demo", projectJson, fallbackVisibility: "private", now: NOW });
    expect(project.id).toBe("demo");
    expect(project.title).toBe("demo");
    expect(project.visibility).toBe("private");
    expect(project.projectFile).toBe("projects/demo/project.json");
    expect(project.defaultSketch).toBe("projects/demo/sketches/system-map.excalidraw.json");
    expect(project.defaultSketchId).toBe("system-map");
    expect(project.notesFile).toBe("projects/demo/docs/notes.md");
    expect(project.sharing).toEqual({ enabled: false, embed: false });
    expect(project.updatedAt).toBe(NOW);
  }
});

test("ignores wrongly typed fields instead of trusting them", () => {
  const project = projectFromProjectJson({
    projectId: "demo",
    projectJson: { title: 7, visibility: "everyone", sharing: { enabled: "yes" }, docs: { notes: 1 } },
    fallbackVisibility: "public",
    now: NOW,
  });

  expect(project.title).toBe("demo");
  expect(project.visibility).toBe("public");
  expect(project.sharing).toEqual({ enabled: true, embed: true });
  expect(project.notesFile).toBe("projects/demo/docs/notes.md");
});

test("an explicit sharing setting wins over visibility", () => {
  const project = projectFromProjectJson({
    projectId: "demo",
    projectJson: { visibility: "public", sharing: { enabled: false, embed: false } },
    fallbackVisibility: "public",
    now: NOW,
  });

  expect(project.sharing).toEqual({ enabled: false, embed: false });
});

test("normalizeProjectsMetadata rejects anything without a projects array", () => {
  expect(normalizeProjectsMetadata(null)).toBeNull();
  expect(normalizeProjectsMetadata({})).toBeNull();
  expect(normalizeProjectsMetadata({ projects: "nope" })).toBeNull();
});

test("normalizeProjectsMetadata drops an incomplete workspace block", () => {
  const metadata = normalizeProjectsMetadata({ workspace: { owner: "me" }, projects: [{ id: "a", title: "A" }] });
  expect(metadata?.workspace).toBeUndefined();
  expect(metadata?.projects.map((project) => project.id)).toEqual(["a"]);
});

test("buildProjectsMetadata de-duplicates by id and sorts by title", () => {
  const make = (id: string, title: string) =>
    projectFromProjectJson({ projectId: id, projectJson: { title }, fallbackVisibility: "public", now: NOW });
  const metadata = buildProjectsMetadata({
    projects: [make("b", "Zeta"), make("a", "Alpha"), make("b", "Duplicate")],
    now: NOW,
  });

  expect(metadata.projects.map((project) => project.title)).toEqual(["Alpha", "Zeta"]);
  expect(metadata.updatedAt).toBe(NOW);
});

test("mergeProjectsMetadata replaces the project with the same id", () => {
  const make = (id: string, title: string) =>
    projectFromProjectJson({ projectId: id, projectJson: { title }, fallbackVisibility: "public", now: NOW });
  const existing = buildProjectsMetadata({
    projects: [make("a", "Old"), make("b", "Other")],
    workspace: { owner: "me", repo: "ws", defaultBranch: "trunk" },
    now: NOW,
  });
  const merged = mergeProjectsMetadata({ existing, project: make("a", "New"), now: NOW });

  expect(merged.projects.map((project) => project.title)).toEqual(["New", "Other"]);
  expect(merged.workspace?.defaultBranch).toBe("trunk");
});
