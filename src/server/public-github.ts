import "server-only";

import { cache } from "react";

import type { SketchScene } from "@/lib/api";
import { GITHUB_REST_API_VERSION } from "@/lib/config";
import { encodeGithubBranch } from "@/server/github-validation";

export type PublicProjectFile = {
	title?: string;
	visibility?: string;
	updatedAt?: string;
	sketches?: Array<{ id?: string; title?: string; file?: string }>;
	sharing?: { enabled?: boolean; embed?: boolean };
};

type PublicRepo = {
	default_branch?: string;
};

export function safeGithubSegment(value: string) {
	if (!/^[A-Za-z0-9_.-]+$/.test(value)) {
		throw new Error("Invalid path segment");
	}

	return value;
}

function safeGithubPath(value: string) {
	if (!/^[A-Za-z0-9_./-]+$/.test(value) || value.includes("..") || value.startsWith("/")) {
		throw new Error("Invalid GitHub path");
	}

	return value;
}

// Returns null when GitHub will not answer (unauthenticated calls are limited to 60 per hour
// per egress IP), so callers can fall back to probing common branch names instead.
export async function getPublicRepoDefaultBranch(owner: string, repo: string) {
	try {
		const response = await fetch(
			`https://api.github.com/repos/${safeGithubSegment(owner)}/${safeGithubSegment(repo)}`,
			{
				headers: {
					Accept: "application/vnd.github+json",
					"X-GitHub-Api-Version": GITHUB_REST_API_VERSION,
				},
				next: { revalidate: 3600 },
			},
		);

		if (!response.ok) {
			return null;
		}

		const repository = (await response.json()) as PublicRepo;
		return repository.default_branch || null;
	} catch {
		return null;
	}
}

const FALLBACK_BRANCHES = ["main", "master"];

export async function readPublicJson<T>(input: {
	owner: string;
	repo: string;
	branch: string;
	path: string;
}) {
	const url = `https://raw.githubusercontent.com/${safeGithubSegment(input.owner)}/${safeGithubSegment(input.repo)}/${encodeGithubBranch(input.branch)}/${safeGithubPath(input.path)}`;
	const response = await fetch(url, { next: { revalidate: 60 } });

	if (!response.ok) {
		return null;
	}

	return (await response.json()) as T;
}

export async function readPublicText(input: {
	owner: string;
	repo: string;
	branch: string;
	path: string;
}) {
	const url = `https://raw.githubusercontent.com/${safeGithubSegment(input.owner)}/${safeGithubSegment(input.repo)}/${encodeGithubBranch(input.branch)}/${safeGithubPath(input.path)}`;
	const response = await fetch(url, { next: { revalidate: 60 } });

	if (!response.ok) {
		return null;
	}

	return response.text();
}

export async function readPublicProject(input: {
	owner: string;
	repo: string;
	branch: string;
	projectId: string;
}) {
	return readPublicJson<PublicProjectFile>({
		...input,
		path: `projects/${safeGithubSegment(input.projectId)}/project.json`,
	});
}

export async function readPublicSketch(input: {
	owner: string;
	repo: string;
	branch: string;
	projectId: string;
	project: PublicProjectFile | null;
}) {
	const firstSketch = input.project?.sketches?.[0];
	const sketchPath =
		firstSketch?.file ||
		`projects/${safeGithubSegment(input.projectId)}/sketches/system-map.excalidraw.json`;

	return readPublicJson<SketchScene>({
		...input,
		path: sketchPath,
	});
}

export type PublicProjectView = {
	branch: string;
	project: PublicProjectFile | null;
	scene: SketchScene | null;
};

// Shared loader for the share and embed pages. Returns null (render a 404) when the URL is
// malformed or the owner has turned sharing off for the project.
async function loadPublicProjectViewUncached(input: {
	owner: string;
	repo: string;
	projectId: string;
	ref?: string;
	mode: "share" | "embed";
}): Promise<PublicProjectView | null> {
	try {
		safeGithubSegment(input.owner);
		safeGithubSegment(input.repo);
		safeGithubSegment(input.projectId);
		// raw.githubusercontent.com is not subject to the API rate limit, so when the default
		// branch is unknown we probe the common names there.
		const knownBranch = input.ref || (await getPublicRepoDefaultBranch(input.owner, input.repo));
		const candidates = knownBranch ? [knownBranch] : FALLBACK_BRANCHES;

		for (const branch of candidates) {
			encodeGithubBranch(branch);

			const base = { owner: input.owner, repo: input.repo, branch, projectId: input.projectId };
			const project = await readPublicProject(base).catch(() => null);

			if (project) {
				const sharingOff = project.sharing?.enabled === false || project.visibility === "private";
				const embedOff = input.mode === "embed" && project.sharing?.embed === false;
				if (sharingOff || embedOff) {
					return null;
				}
			}

			const scene = await readPublicSketch({ ...base, project }).catch(() => null);
			if (project || scene) {
				return { branch, project, scene };
			}
		}

		return null;
	} catch {
		return null;
	}
}

// Deduplicates the load between generateMetadata and the page render of one request.
export const loadPublicProjectView = cache(
	(owner: string, repo: string, projectId: string, ref: string | undefined, mode: "share" | "embed") =>
		loadPublicProjectViewUncached({ owner, repo, projectId, ref, mode }),
);
