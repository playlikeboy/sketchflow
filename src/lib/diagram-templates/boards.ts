// Starter diagrams for organising ideas, people and work: a mind map, an org chart and a
// Kanban board.

import { centered, type Box, type Size } from "@/lib/diagram-templates/geometry";
import {
	connect,
	container,
	node,
	paletteFor,
	type ArrowOptions,
	type DiagramSkeleton,
	type DiagramTheme,
	type Palette,
	type ShapeSkeleton,
} from "@/lib/diagram-templates/skeleton";

// Branches of a map or a tree are plain connectors, without an arrowhead.
const PLAIN_LINK: ArrowOptions = { endHead: null };

// --- Mind map --------------------------------------------------------------------------------

const TOPIC: Size = { width: 190, height: 90 };
const BRANCH: Size = { width: 130, height: 50 };
const LEAF: Size = { width: 116, height: 40 };
// Distances from the middle of the topic to the middle of a branch and of a leaf.
const BRANCH_DISTANCE = 205;
const LEAF_DISTANCE = 374;
const BRANCH_ROW_PITCH = 140;
const LEAF_ROW_PITCH = 60;

// `side` is 1 for the right of the topic and -1 for the left; `row` runs from -1 (top) to 1.
const BRANCHES = [
	{ id: "goals", text: "Goals", side: 1, row: -1, leaves: ["Revenue", "Retention"] },
	{ id: "audience", text: "Audience", side: 1, row: 0, leaves: [] },
	{ id: "timeline", text: "Timeline", side: 1, row: 1, leaves: ["Beta", "Launch day"] },
	{ id: "team", text: "Team", side: -1, row: -1, leaves: ["Design", "Build"] },
	{ id: "budget", text: "Budget", side: -1, row: 0, leaves: [] },
	{ id: "risks", text: "Risks", side: -1, row: 1, leaves: ["Delays", "Scope"] },
] as const;

type Branch = (typeof BRANCHES)[number];

function leafBox(branch: Branch, index: number): Box {
	const offset = (index - (branch.leaves.length - 1) / 2) * LEAF_ROW_PITCH;
	return centered(branch.side * LEAF_DISTANCE, branch.row * BRANCH_ROW_PITCH + offset, LEAF);
}

function branchWithLeaves(palette: Palette, topic: ShapeSkeleton, branch: Branch): DiagramSkeleton[] {
	const box = centered(branch.side * BRANCH_DISTANCE, branch.row * BRANCH_ROW_PITCH, BRANCH);
	const branchNode = node(palette, branch.id, box, branch.text, { fill: "neutral" });
	const leaves = branch.leaves.map((text, index) => node(palette, `${branch.id}-leaf-${index + 1}`, leafBox(branch, index), text));

	return [
		branchNode,
		...leaves,
		connect(palette, `topic-to-${branch.id}`, topic, branchNode, PLAIN_LINK),
		...leaves.map((leaf) => connect(palette, `${branch.id}-to-${leaf.id}`, branchNode, leaf, PLAIN_LINK)),
	];
}

/** A central topic with six branches, four of which have two leaves each. */
export function buildMindMap(theme: DiagramTheme): DiagramSkeleton[] {
	const palette = paletteFor(theme);
	const topic = node(palette, "topic", centered(0, 0, TOPIC), "Product launch", { kind: "ellipse", fill: "accent" });

	return [topic, ...BRANCHES.flatMap((branch) => branchWithLeaves(palette, topic, branch))];
}

// --- Org chart -------------------------------------------------------------------------------

const ORG_COLUMN_PITCH = 140;
const ORG_LEVEL_PITCH = 140;
const ORG_ROOT: Size = { width: 160, height: 56 };
const ORG_MEMBER: Size = { width: 124, height: 56 };
const REPORTS_PER_TEAM = 2;

const TEAMS = [
	{ id: "engineering", lead: "Engineering", reports: ["Frontend", "Backend"] },
	{ id: "product", lead: "Product", reports: ["Design", "Research"] },
	{ id: "operations", lead: "Operations", reports: ["Support", "Finance"] },
] as const;

// Columns are counted in report-sized slots, so a lead sits centred above its reports.
function orgBox(column: number, level: number, size: Size): Box {
	return centered(column * ORG_COLUMN_PITCH, level * ORG_LEVEL_PITCH, size);
}

function teamShapes(palette: Palette, root: ShapeSkeleton, teamIndex: number): DiagramSkeleton[] {
	const team = TEAMS[teamIndex];
	const firstColumn = teamIndex * REPORTS_PER_TEAM;
	const lead = node(palette, team.id, orgBox(firstColumn + (REPORTS_PER_TEAM - 1) / 2, 1, ORG_MEMBER), team.lead, { fill: "neutral" });
	const reports = team.reports.map((text, index) => node(palette, `${team.id}-report-${index + 1}`, orgBox(firstColumn + index, 2, ORG_MEMBER), text));

	return [
		lead,
		...reports,
		connect(palette, `root-to-${team.id}`, root, lead, PLAIN_LINK),
		...reports.map((report) => connect(palette, `${team.id}-to-${report.id}`, lead, report, PLAIN_LINK)),
	];
}

/** A root with three teams beneath it, each with two reports. */
export function buildOrgChart(theme: DiagramTheme): DiagramSkeleton[] {
	const palette = paletteFor(theme);
	const middleColumn = (TEAMS.length * REPORTS_PER_TEAM - 1) / 2;
	const root = node(palette, "root", orgBox(middleColumn, 0, ORG_ROOT), "CEO", { fill: "accent" });

	return [root, ...TEAMS.flatMap((_, teamIndex) => teamShapes(palette, root, teamIndex))];
}

// --- Kanban board ----------------------------------------------------------------------------

const BOARD_COLUMN_WIDTH = 220;
const BOARD_COLUMN_GAP = 24;
// Room above a column's cards for its title.
const BOARD_TITLE_HEIGHT = 44;
const BOARD_PADDING = 16;
const CARD: Size = { width: BOARD_COLUMN_WIDTH - BOARD_PADDING * 2, height: 68 };
const CARD_GAP = 12;
// Every column is tall enough for this many cards, so there is room to drop more in.
const CARD_SLOTS = 4;
const BOARD_COLUMN_HEIGHT = BOARD_TITLE_HEIGHT + CARD_SLOTS * (CARD.height + CARD_GAP) - CARD_GAP + BOARD_PADDING;

const BOARD_COLUMNS = [
	{ id: "to-do", title: "To do", cards: ["Write the brief", "Sketch the flow", "Plan the release"] },
	{ id: "in-progress", title: "In progress", cards: ["Build the API", "Review designs"] },
	{ id: "done", title: "Done", cards: ["Kickoff"] },
] as const;

function boardColumnShapes(palette: Palette, columnIndex: number): DiagramSkeleton[] {
	const column = BOARD_COLUMNS[columnIndex];
	const x = columnIndex * (BOARD_COLUMN_WIDTH + BOARD_COLUMN_GAP);
	const backdrop = container(palette, column.id, { x, y: 0, width: BOARD_COLUMN_WIDTH, height: BOARD_COLUMN_HEIGHT }, column.title);
	const cards = column.cards.map((text, index) =>
		node(palette, `${column.id}-card-${index + 1}`, { x: x + BOARD_PADDING, y: BOARD_TITLE_HEIGHT + index * (CARD.height + CARD_GAP), ...CARD }, text, {
			fill: "accent",
		}),
	);

	return [backdrop, ...cards];
}

/** Three columns (to do, in progress, done) with a few cards to move between them. */
export function buildKanban(theme: DiagramTheme): DiagramSkeleton[] {
	const palette = paletteFor(theme);
	return BOARD_COLUMNS.flatMap((_, columnIndex) => boardColumnShapes(palette, columnIndex));
}
