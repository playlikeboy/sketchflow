export const PROJECTS_METADATA_PATH = "projects/projects-metadata.json";

export type ProjectVisibility = "private" | "public";

export type ProjectSketchMetadata = {
	id: string;
	title: string;
	file: string;
	thumbnail?: string;
	updatedAt?: string;
};

export type WorkspaceProject = {
	id: string;
	title: string;
	description?: string;
	visibility: ProjectVisibility;
	createdAt?: string;
	updatedAt: string;
	projectFile: string;
	defaultSketch: string;
	defaultSketchId: string;
	notesFile: string;
	sketches: ProjectSketchMetadata[];
	sharing: {
		enabled: boolean;
		embed: boolean;
	};
};

export type ProjectsMetadata = {
	schemaVersion: 1;
	updatedAt: string;
	workspace?: {
		owner: string;
		repo: string;
		defaultBranch: string;
	};
	projects: WorkspaceProject[];
};

type WorkspaceMetadataInput = NonNullable<ProjectsMetadata["workspace"]>;

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function stringValue(value: unknown, fallback: string) {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function visibilityValue(value: unknown, fallback: ProjectVisibility): ProjectVisibility {
	return value === "private" || value === "public" ? value : fallback;
}

function sketchIdFromFile(file: string, fallback: string) {
	const match = file.match(/\/([^/]+)\.excalidraw\.json$/);
	return match?.[1] || fallback;
}

function normalizeSketches(value: unknown, projectId: string, fallbackSketchId: string) {
	if (!Array.isArray(value)) {
		return [
			{
				id: fallbackSketchId,
				title: "System Map",
				file: `projects/${projectId}/sketches/${fallbackSketchId}.excalidraw.json`,
			},
		] satisfies ProjectSketchMetadata[];
	}

	const sketches = value
		.map((item) => {
			const sketch = asRecord(item);
			if (!sketch) return null;

			const file = stringValue(
				sketch.file,
				`projects/${projectId}/sketches/${fallbackSketchId}.excalidraw.json`,
			);
			const id = stringValue(sketch.id, sketchIdFromFile(file, fallbackSketchId));

			return {
				id,
				title: stringValue(sketch.title, id),
				file,
				thumbnail: typeof sketch.thumbnail === "string" ? sketch.thumbnail : undefined,
				updatedAt: typeof sketch.updatedAt === "string" ? sketch.updatedAt : undefined,
			} satisfies ProjectSketchMetadata;
		})
		.filter(Boolean) as ProjectSketchMetadata[];

	return sketches.length > 0
		? sketches
		: [
				{
					id: fallbackSketchId,
					title: "System Map",
					file: `projects/${projectId}/sketches/${fallbackSketchId}.excalidraw.json`,
				},
			];
}

export function projectFromProjectJson(input: {
	projectId: string;
	projectJson: unknown;
	fallbackVisibility: ProjectVisibility;
	fallbackSketchId?: string;
	now?: string;
}) {
	const now = input.now ?? new Date().toISOString();
	const fallbackSketchId = input.fallbackSketchId ?? "system-map";
	const project = asRecord(input.projectJson) ?? {};
	const sketches = normalizeSketches(project.sketches, input.projectId, fallbackSketchId);
	const defaultSketch = stringValue(project.defaultSketch, sketches[0]?.file ?? `projects/${input.projectId}/sketches/${fallbackSketchId}.excalidraw.json`);
	const defaultSketchId = sketchIdFromFile(defaultSketch, sketches[0]?.id ?? fallbackSketchId);
	const docs = asRecord(project.docs);
	const sharing = asRecord(project.sharing);
	const visibility = visibilityValue(project.visibility, input.fallbackVisibility);

	return {
		id: stringValue(project.id, input.projectId),
		title: stringValue(project.title, input.projectId),
		description: typeof project.description === "string" ? project.description : undefined,
		visibility,
		createdAt: typeof project.createdAt === "string" ? project.createdAt : undefined,
		updatedAt: stringValue(project.updatedAt, now),
		projectFile: stringValue(project.projectFile, `projects/${input.projectId}/project.json`),
		defaultSketch,
		defaultSketchId,
		notesFile: stringValue(docs?.notes, `projects/${input.projectId}/docs/notes.md`),
		sketches,
		sharing: {
			enabled: typeof sharing?.enabled === "boolean" ? sharing.enabled : visibility === "public",
			embed: typeof sharing?.embed === "boolean" ? sharing.embed : visibility === "public",
		},
	} satisfies WorkspaceProject;
}

export function normalizeProjectsMetadata(value: unknown) {
	const metadata = asRecord(value);
	if (!metadata || !Array.isArray(metadata.projects)) {
		return null;
	}

	const now = new Date().toISOString();
	const workspace = asRecord(metadata.workspace);

	return {
		schemaVersion: 1,
		updatedAt: stringValue(metadata.updatedAt, now),
		workspace:
			workspace &&
			typeof workspace.owner === "string" &&
			typeof workspace.repo === "string" &&
			typeof workspace.defaultBranch === "string"
				? {
						owner: workspace.owner,
						repo: workspace.repo,
						defaultBranch: workspace.defaultBranch,
					}
				: undefined,
		projects: metadata.projects.map((project) =>
			projectFromProjectJson({
				projectId: stringValue(asRecord(project)?.id, "untitled"),
				projectJson: project,
				fallbackVisibility: "public",
				now,
			}),
		),
	} satisfies ProjectsMetadata;
}

export function buildProjectsMetadata(input: {
	projects: WorkspaceProject[];
	workspace?: WorkspaceMetadataInput;
	now?: string;
}) {
	const now = input.now ?? new Date().toISOString();
	const seen = new Set<string>();
	const projects = input.projects
		.filter((project) => {
			if (seen.has(project.id)) return false;
			seen.add(project.id);
			return true;
		})
		.sort((a, b) => a.title.localeCompare(b.title));

	return {
		schemaVersion: 1,
		updatedAt: now,
		workspace: input.workspace,
		projects,
	} satisfies ProjectsMetadata;
}

export function mergeProjectsMetadata(input: {
	existing: ProjectsMetadata | null | undefined;
	project: WorkspaceProject;
	workspace?: WorkspaceMetadataInput;
	now?: string;
}) {
	const projects = [
		input.project,
		...(input.existing?.projects ?? []).filter((project) => project.id !== input.project.id),
	];

	return buildProjectsMetadata({
		projects,
		workspace: input.workspace ?? input.existing?.workspace,
		now: input.now,
	});
}
