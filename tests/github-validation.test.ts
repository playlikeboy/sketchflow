import { expect, test } from "bun:test";

import {
  validateGithubFileChange,
  validateGithubFilePath,
  validateGithubRepoName,
  jsDelivrBaseUrl,
  encodeGithubBranch,
  validateGithubBranch,
  validateProjectScopedPath,
} from "../src/server/github-validation";

test("rejects unsafe GitHub paths", () => {
  expect(() => validateGithubFilePath("../secret")).toThrow();
  expect(() => validateGithubFilePath("/absolute/path")).toThrow();
  expect(() => validateGithubFilePath("nested\\escape")).toThrow();
  expect(validateGithubFilePath("projects/demo/project.json")).toBe("projects/demo/project.json");
});

test("validates repository names", () => {
  expect(validateGithubRepoName("my_workspace-01")).toBe("my_workspace-01");
  expect(() => validateGithubRepoName(".hidden")).toThrow();
  expect(() => validateGithubRepoName("bad/name")).toThrow();
});

test("enforces the GitHub file-size limit", () => {
  expect(() =>
    validateGithubFileChange({
      path: "large.txt",
      content: "x".repeat(8_000_001),
    }),
  ).toThrow();
});

test("builds immutable jsDelivr URLs", () => {
  expect(jsDelivrBaseUrl("owner", "repo", "0123456789abcdef")).toBe(
    "https://cdn.jsdelivr.net/gh/owner/repo@0123456789abcdef/",
  );
});

test("validates branch names used in GitHub ref paths", () => {
  expect(validateGithubBranch("main")).toBe("main");
  expect(encodeGithubBranch("feature/new canvas".replace(" ", "-"))).toBe("feature/new-canvas");
  expect(encodeGithubBranch("release/v1#2")).toBe("release/v1%232");
  for (const bad of ["", "/main", "main/", "a/../../user", "a//b", "has space", "x?y=1", ".hidden", "a/.b", "v1.lock", "a@{b"]) {
    expect(() => validateGithubBranch(bad)).toThrow();
  }
});

test("keeps restored paths inside the project folder", () => {
  expect(validateProjectScopedPath("demo", "projects/demo/sketches/a.excalidraw.json")).toBe(
    "projects/demo/sketches/a.excalidraw.json",
  );
  expect(() => validateProjectScopedPath("demo", ".github/workflows/ci.yml")).toThrow();
  expect(() => validateProjectScopedPath("demo", "projects/demo-other/project.json")).toThrow();
  expect(() => validateProjectScopedPath("demo", "projects/demo/../other/x.json")).toThrow();
  expect(() => validateProjectScopedPath("demo", 42)).toThrow();
});
