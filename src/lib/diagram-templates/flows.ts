// Starter diagrams that describe a process: a flowchart, swimlanes and a user journey.

import { centered, type Box, type Size } from "@/lib/diagram-templates/geometry";
import { connect, container, elbow, node, paletteFor, type DiagramSkeleton, type DiagramTheme, type Palette, type ShapeSkeleton } from "@/lib/diagram-templates/skeleton";

// --- Flowchart -------------------------------------------------------------------------------

const FLOW_COLUMN_PITCH = 250;
const FLOW_ROW_PITCH = 150;
const FLOW_STEP: Size = { width: 170, height: 64 };
const FLOW_TERMINAL: Size = { width: 150, height: 60 };
const FLOW_DECISION: Size = { width: 190, height: 110 };

function flowCell(column: number, row: number, size: Size): Box {
	return centered(column * FLOW_COLUMN_PITCH, row * FLOW_ROW_PITCH, size);
}

/** Start, a step, a yes/no decision with an error branch that loops back, and an end. */
export function buildFlowchart(theme: DiagramTheme): DiagramSkeleton[] {
	const palette = paletteFor(theme);
	const start = node(palette, "start", flowCell(0, 0, FLOW_TERMINAL), "Start", { kind: "ellipse", fill: "accent" });
	const collect = node(palette, "collect", flowCell(0, 1, FLOW_STEP), "Collect input");
	const check = node(palette, "check", flowCell(0, 2, FLOW_DECISION), "Valid?", { kind: "diamond", fill: "neutral" });
	const process = node(palette, "process", flowCell(0, 3, FLOW_STEP), "Process request");
	const done = node(palette, "done", flowCell(0, 4, FLOW_TERMINAL), "Done", { kind: "ellipse", fill: "accent" });
	const fix = node(palette, "fix", flowCell(1, 2, FLOW_STEP), "Show error");

	return [
		start,
		collect,
		check,
		process,
		done,
		fix,
		connect(palette, "start-to-collect", start, collect),
		connect(palette, "collect-to-check", collect, check),
		connect(palette, "check-to-process", check, process, { label: "Yes" }),
		connect(palette, "process-to-done", process, done),
		connect(palette, "check-to-fix", check, fix, { label: "No" }),
		elbow(palette, "fix-to-collect", fix, "top", collect, "right"),
	];
}

// --- Swimlanes -------------------------------------------------------------------------------

const LANE_HEIGHT = 130;
// Room at the left of each lane for its name.
const LANE_HEADER_WIDTH = 110;
const LANE_END_PADDING = 10;
const LANE_STEP_PITCH = 150;
const LANE_STEP: Size = { width: 130, height: 60 };

const LANES = ["Customer", "Sales", "Fulfilment"] as const;

// One step per column, so every hand-off moves right and crosses into another lane.
const LANE_STEPS = [
	{ id: "place-order", text: "Place order", lane: 0 },
	{ id: "check-stock", text: "Check stock", lane: 1 },
	{ id: "pack-items", text: "Pack items", lane: 2 },
	{ id: "send-invoice", text: "Send invoice", lane: 1 },
	{ id: "receive-order", text: "Receive order", lane: 0 },
] as const;

function laneBox(lane: number): Box {
	const width = LANE_HEADER_WIDTH + LANE_STEPS.length * LANE_STEP_PITCH + LANE_END_PADDING;
	return { x: 0, y: lane * LANE_HEIGHT, width, height: LANE_HEIGHT };
}

function laneStepBox(lane: number, column: number): Box {
	return centered(LANE_HEADER_WIDTH + (column + 0.5) * LANE_STEP_PITCH, (lane + 0.5) * LANE_HEIGHT, LANE_STEP);
}

function handOff(palette: Palette, from: ShapeSkeleton, fromLane: number, to: ShapeSkeleton, toLane: number) {
	const id = `${from.id}-to-${to.id}`;
	if (fromLane === toLane) return connect(palette, id, from, to);
	return elbow(palette, id, from, "right", to, toLane > fromLane ? "top" : "bottom");
}

/** Three lanes with a five-step process that is handed from one lane to the next. */
export function buildSwimlanes(theme: DiagramTheme): DiagramSkeleton[] {
	const palette = paletteFor(theme);
	const lanes = LANES.map((name, lane) => container(palette, `lane-${lane}`, laneBox(lane), name));
	const steps = LANE_STEPS.map((step, column) => node(palette, step.id, laneStepBox(step.lane, column), step.text, { fill: "accent" }));
	const handOffs = steps.slice(1).map((step, index) => handOff(palette, steps[index], LANE_STEPS[index].lane, step, LANE_STEPS[index + 1].lane));

	return [...lanes, ...steps, ...handOffs];
}

// --- User journey ----------------------------------------------------------------------------

const JOURNEY_PITCH = 190;
const JOURNEY_STAGE: Size = { width: 130, height: 56 };
const JOURNEY_NOTE: Size = { width: 130, height: 64 };
const JOURNEY_NOTE_GAP = 40;

const JOURNEY_STAGES = [
	{ id: "discover", name: "Discover", note: "Sees an ad" },
	{ id: "sign-up", name: "Sign up", note: "Creates an account" },
	{ id: "onboard", name: "Onboard", note: "Imports data" },
	{ id: "activate", name: "Activate", note: "Ships a project" },
	{ id: "retain", name: "Retain", note: "Invites the team" },
] as const;

/** Five stages from left to right, each with a note about what the person does there. */
export function buildJourney(theme: DiagramTheme): DiagramSkeleton[] {
	const palette = paletteFor(theme);
	const stages = JOURNEY_STAGES.map((stage, index) =>
		node(palette, stage.id, { x: index * JOURNEY_PITCH, y: 0, ...JOURNEY_STAGE }, stage.name, { fill: "accent" }),
	);
	const notes = JOURNEY_STAGES.map((stage, index) =>
		node(palette, `${stage.id}-note`, { x: index * JOURNEY_PITCH, y: JOURNEY_STAGE.height + JOURNEY_NOTE_GAP, ...JOURNEY_NOTE }, stage.note, { dashed: true }),
	);
	const steps = stages.slice(1).map((stage, index) => connect(palette, `${stages[index].id}-to-${stage.id}`, stages[index], stage));
	const links = stages.map((stage, index) => connect(palette, `${stage.id}-to-note`, stage, notes[index], { dashed: true, endHead: null }));

	return [...stages, ...notes, ...steps, ...links];
}
