import type { SketchScene } from "@/lib/api";

export type PublicProjectFile = {
	title?: string;
	visibility?: string;
	updatedAt?: string;
	sketches?: Array<{ id?: string; title?: string; file?: string }>;
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

export async function getPublicRepoDefaultBranch(owner: string, repo: string) {
	const response = await fetch(
		`https://api.github.com/repos/${safeGithubSegment(owner)}/${safeGithubSegment(repo)}`,
		{
			headers: {
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2026-03-10",
			},
			next: { revalidate: 300 },
		},
	);

	if (!response.ok) {
		return "main";
	}

	const repository = (await response.json()) as PublicRepo;
	return repository.default_branch || "main";
}

export async function readPublicJson<T>(input: {
	owner: string;
	repo: string;
	branch: string;
	path: string;
}) {
	const url = `https://raw.githubusercontent.com/${safeGithubSegment(input.owner)}/${safeGithubSegment(input.repo)}/${safeGithubSegment(input.branch)}/${safeGithubPath(input.path)}`;
	const response = await fetch(url, { next: { revalidate: 60 } });

	if (!response.ok) {
		return null;
	}

	return (await response.json()) as T;
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
