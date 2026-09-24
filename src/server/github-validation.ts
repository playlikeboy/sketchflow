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
