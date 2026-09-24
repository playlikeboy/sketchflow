import { expect, test } from "bun:test";

import {
  GithubConflictError,
  jsDelivrBaseUrl,
  validateGithubFileChange,
  validateGithubFilePath,
  validateGithubRepoName,
} from "../src/server/github";

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

test("exposes a typed GitHub conflict response", () => {
  const error = new GithubConflictError("branch changed");
  expect(error.status).toBe(409);
  expect(error.code).toBe("github_conflict");
});
