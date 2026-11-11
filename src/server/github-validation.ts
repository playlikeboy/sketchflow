export type GithubFileChange = {
  path: string;
  content: string;
};

export function validateGithubRepoName(repoName: string) {
  if (!/^[A-Za-z0-9_.-]+$/.test(repoName)) {
    throw new Error("Repository name can only contain letters, numbers, dots, dashes, and underscores");
  }
  if (repoName.startsWith(".") || repoName.endsWith(".")) {
    throw new Error("Repository name cannot start or end with a dot");
  }
  return repoName;
}

export function validateGithubPathSegment(segment: string) {
  return validateGithubRepoName(segment);
}

export function validateGithubFilePath(path: string) {
  if (!path || path.startsWith("/") || path.includes("..") || path.includes("\\")) {
    throw new Error("Unsafe GitHub file path: " + (path || "(empty)"));
  }
  return path;
}

export function validateGithubFileChange(file: GithubFileChange, maxBytes = 8_000_000) {
  validateGithubFilePath(file.path);
  const size = new TextEncoder().encode(file.content).byteLength;
  if (size > maxBytes) {
    throw new Error("File is too large for Git-backed sync: " + file.path + ". Keep uploaded images under 8 MB.");
  }
  return file;
}

export function jsDelivrBaseUrl(owner: string, repo: string, commitSha: string) {
  return "https://cdn.jsdelivr.net/gh/" + owner + "/" + repo + "@" + commitSha + "/";
}

// Git ref rules (subset of `git check-ref-format`) for branch names used in API paths.
export function validateGithubBranch(branch: string) {
  if (
    !branch ||
    branch.length > 255 ||
    branch.startsWith("/") ||
    branch.endsWith("/") ||
    branch.endsWith(".") ||
    branch.endsWith(".lock") ||
    branch.includes("..") ||
    branch.includes("//") ||
    branch.includes("@{") ||
    /[\x00-\x20\x7f~^:?*[\\]/.test(branch) ||
    branch.split("/").some((part) => part.startsWith("."))
  ) {
    throw new Error("Invalid branch name: " + (branch || "(empty)"));
  }
  return branch;
}

export function encodeGithubBranch(branch: string) {
  return validateGithubBranch(branch).split("/").map(encodeURIComponent).join("/");
}

// Ensures a path read from repo content stays inside the given project folder.
export function validateProjectScopedPath(projectId: string, path: unknown) {
  if (typeof path !== "string") {
    throw new Error("Expected a project file path");
  }
  validateGithubFilePath(path);
  if (!path.startsWith("projects/" + projectId + "/")) {
    throw new Error("Path is outside project " + projectId + ": " + path);
  }
  return path;
}
