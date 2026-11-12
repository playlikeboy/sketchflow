// The starter diagrams offered in the Insert panel's Diagrams tab.
//
// Each one is plain data (boxes with labels, arrows that name the boxes they join) that
// Excalidraw turns into real, editable shapes. Nothing here imports Excalidraw, so the layouts
// are checked in tests: see tests/diagram-templates.test.ts.

import { buildKanban, buildMindMap, buildOrgChart } from "@/lib/diagram-templates/boards";
import { buildFlowchart, buildJourney, buildSwimlanes } from "@/lib/diagram-templates/flows";
import { skeletonExtent } from "@/lib/diagram-templates/measure";
import type { DiagramSkeleton, DiagramTheme, ShapeSkeleton } from "@/lib/diagram-templates/skeleton";
import { buildArchitecture, buildEntityRelationship, buildSequence } from "@/lib/diagram-templates/systems";

export { boxContains, boxesOverlap, isInside } from "@/lib/diagram-templates/geometry";
export { absolutePoints, estimateTextWidth, isArrow, isShape, labelFits, LINE_HEIGHT, skeletonExtent } from "@/lib/diagram-templates/measure";
export { PREVIEW_SIZE, templatePreview, type PreviewLine, type PreviewShape, type TemplatePreview } from "@/lib/diagram-templates/preview";
export { ARROW_GAP, type ArrowSkeleton, type DiagramSkeleton, type DiagramTheme, type LineSkeleton, type ShapeSkeleton } from "@/lib/diagram-templates/skeleton";

/** Diagrams are inserted with their longest side between these sizes, in canvas units. */
export const MIN_TARGET_SIZE = 640;
export const MAX_TARGET_SIZE = 900;

export type DiagramTemplate = {
	id: string;
	name: string;
	description: string;
	/** Longest side of the inserted diagram, for `insertElements`. */
	targetSize: number;
	build: (theme: DiagramTheme) => DiagramSkeleton[];
};

type TemplateDefinition = Omit<DiagramTemplate, "targetSize">;

// Templates are laid out at the size they should appear, so text stays close to its drawn
// size. The target is that natural size, kept within the range that suits the canvas.
function withTargetSize(definition: TemplateDefinition): DiagramTemplate {
	const extent = skeletonExtent(definition.build("light"));
	const naturalSize = Math.round(Math.max(extent.width, extent.height));
	return { ...definition, targetSize: Math.min(MAX_TARGET_SIZE, Math.max(MIN_TARGET_SIZE, naturalSize)) };
}

const DEFINITIONS: readonly TemplateDefinition[] = [
	{ id: "flowchart", name: "Flowchart", description: "Steps, a yes/no decision and a loop back.", build: buildFlowchart },
	{ id: "sequence", name: "Sequence diagram", description: "Three participants exchanging five messages.", build: buildSequence },
	{ id: "entity-relationship", name: "Entity relationship", description: "Three tables with fields and labelled links.", build: buildEntityRelationship },
	{ id: "architecture", name: "System architecture", description: "Clients, a gateway, services and data stores.", build: buildArchitecture },
	{ id: "mind-map", name: "Mind map", description: "A central topic with six branches and leaves.", build: buildMindMap },
	{ id: "swimlanes", name: "Swimlanes", description: "A process handed between three lanes.", build: buildSwimlanes },
	{ id: "org-chart", name: "Org chart", description: "A root, three teams and their reports.", build: buildOrgChart },
	{ id: "kanban", name: "Kanban board", description: "To do, in progress and done, with cards.", build: buildKanban },
	{ id: "user-journey", name: "User journey", description: "Five stages from left to right, with notes.", build: buildJourney },
];

export const DIAGRAM_TEMPLATES: readonly DiagramTemplate[] = DEFINITIONS.map(withTargetSize);

/**
 * A template's shapes without our own `container` marker, ready to hand to Excalidraw's
 * `convertToExcalidrawElements`.
 */
export function toConvertibleSkeletons(skeletons: readonly DiagramSkeleton[]): DiagramSkeleton[] {
	return skeletons.map((skeleton) => {
		if (!("container" in skeleton)) return skeleton;
		const { container: _marker, ...shape } = skeleton;
		return shape satisfies ShapeSkeleton;
	});
}
