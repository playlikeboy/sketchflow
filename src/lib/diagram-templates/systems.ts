// Starter diagrams that describe a system: a sequence diagram, an entity-relationship diagram
// and an architecture overview.

import { stackTops, type Box, type Size, type XY } from "@/lib/diagram-templates/geometry";
import { LINE_HEIGHT } from "@/lib/diagram-templates/measure";
import {
	connect,
	container,
	FONT_SIZE,
	freeArrow,
	line,
	node,
	paletteFor,
	type ArrowheadKind,
	type DiagramSkeleton,
	type DiagramTheme,
	type Palette,
} from "@/lib/diagram-templates/skeleton";

// --- Sequence diagram ------------------------------------------------------------------------

const PARTICIPANT_PITCH = 260;
const PARTICIPANT: Size = { width: 150, height: 52 };
const FIRST_MESSAGE_OFFSET = 56;
const MESSAGE_PITCH = 60;
const LIFELINE_TAIL = 44;
// Space between a message's ends and the lifelines it runs between.
const MESSAGE_INSET = 4;

const PARTICIPANTS = [
	{ id: "browser", name: "Browser" },
	{ id: "api", name: "API" },
	{ id: "database", name: "Database" },
] as const;

const MESSAGES = [
	{ from: 0, to: 1, text: "POST /login", isReply: false },
	{ from: 1, to: 2, text: "Find user", isReply: false },
	{ from: 2, to: 1, text: "User row", isReply: true },
	{ from: 1, to: 0, text: "Session token", isReply: true },
	{ from: 0, to: 1, text: "GET /profile", isReply: false },
] as const;

function lifelineX(participant: number) {
	return participant * PARTICIPANT_PITCH + PARTICIPANT.width / 2;
}

function messageY(index: number) {
	return PARTICIPANT.height + FIRST_MESSAGE_OFFSET + index * MESSAGE_PITCH;
}

function messageEnds(from: number, to: number, y: number): [XY, XY] {
	const direction = to > from ? 1 : -1;
	return [
		[lifelineX(from) + direction * MESSAGE_INSET, y],
		[lifelineX(to) - direction * MESSAGE_INSET, y],
	];
}

/** Three participants with lifelines and five messages; replies are dashed. */
export function buildSequence(theme: DiagramTheme): DiagramSkeleton[] {
	const palette = paletteFor(theme);
	const lifelineEnd = messageY(MESSAGES.length - 1) + LIFELINE_TAIL;

	// Each participant is grouped with its lifeline so the two move together.
	const participants = PARTICIPANTS.flatMap((participant, index) => {
		const group = `participant-${participant.id}`;
		const box = { x: index * PARTICIPANT_PITCH, y: 0, ...PARTICIPANT };
		return [
			node(palette, participant.id, box, participant.name, { fill: "accent", group }),
			line(palette, `${participant.id}-lifeline`, [lifelineX(index), PARTICIPANT.height], [lifelineX(index), lifelineEnd], { dashed: true, group }),
		];
	});
	const messages = MESSAGES.map((message, index) => {
		const [from, to] = messageEnds(message.from, message.to, messageY(index));
		return freeArrow(palette, `message-${index + 1}`, from, to, { label: message.text, dashed: message.isReply });
	});

	return [...participants, ...messages];
}

// --- Entity-relationship diagram -------------------------------------------------------------

const ENTITY_PITCH = 340;
const ENTITY_WIDTH = 190;
const ENTITY_HEADER_HEIGHT = 44;
const ENTITY_BODY_PADDING = 12;
const ENTITY_FIELD_COUNT = 4;
const ENTITY_BODY_HEIGHT = ENTITY_FIELD_COUNT * FONT_SIZE * LINE_HEIGHT + ENTITY_BODY_PADDING * 2;

const ENTITIES = [
	{ id: "customer", name: "Customer", fields: ["id  PK", "name", "email", "created_at"] },
	{ id: "order", name: "Order", fields: ["id  PK", "customer_id  FK", "status", "total"] },
	{ id: "product", name: "Product", fields: ["id  PK", "name", "price", "stock"] },
] as const;

type Relationship = { from: number; to: number; label: string; startHead: ArrowheadKind; endHead: ArrowheadKind };

const RELATIONSHIPS: readonly Relationship[] = [
	{ from: 0, to: 1, label: "places", startHead: "crowfoot_one", endHead: "crowfoot_many" },
	{ from: 1, to: 2, label: "contains", startHead: "crowfoot_many", endHead: "crowfoot_many" },
];

function entityShapes(palette: Palette, index: number) {
	const entity = ENTITIES[index];
	const group = `entity-${entity.id}`;
	const x = index * ENTITY_PITCH;
	const header = node(palette, entity.id, { x, y: 0, width: ENTITY_WIDTH, height: ENTITY_HEADER_HEIGHT }, entity.name, { fill: "accent", group });
	const body = node(
		palette,
		`${entity.id}-fields`,
		{ x, y: ENTITY_HEADER_HEIGHT, width: ENTITY_WIDTH, height: ENTITY_BODY_HEIGHT },
		entity.fields.join("\n"),
		{ textAlign: "left", group },
	);
	return { header, body };
}

/** Three entities with their fields, joined by labelled one-to-many and many-to-many lines. */
export function buildEntityRelationship(theme: DiagramTheme): DiagramSkeleton[] {
	const palette = paletteFor(theme);
	const entities = ENTITIES.map((_, index) => entityShapes(palette, index));
	const relationships = RELATIONSHIPS.map((relationship) =>
		connect(palette, `${ENTITIES[relationship.from].id}-${relationship.label}`, entities[relationship.from].body, entities[relationship.to].body, {
			label: relationship.label,
			startHead: relationship.startHead,
			endHead: relationship.endHead,
		}),
	);

	return [...entities.flatMap((entity) => [entity.header, entity.body]), ...relationships];
}

// --- System architecture ---------------------------------------------------------------------

const TIER_COLUMN_PITCH = 200;
const TIER_COLUMNS = 3;
const TIER_PADDING = 24;
// Room above a tier's boxes for its title.
const TIER_TITLE_HEIGHT = 44;
const TIER_BOTTOM_PADDING = 20;
const TIER_GAP = 64;
const SERVICE: Size = { width: 160, height: 64 };

const TIER_WIDTH = TIER_PADDING * 2 + (TIER_COLUMNS - 1) * TIER_COLUMN_PITCH + SERVICE.width;
const TIER_HEIGHT = TIER_TITLE_HEIGHT + SERVICE.height + TIER_BOTTOM_PADDING;
// Top to bottom: the clients tier, the gateway on its own, the services tier, the data tier.
const [CLIENTS_TOP, GATEWAY_TOP, SERVICES_TOP, DATA_TOP] = stackTops([TIER_HEIGHT, SERVICE.height, TIER_HEIGHT, TIER_HEIGHT], TIER_GAP);

function tierBox(top: number): Box {
	return { x: 0, y: top, width: TIER_WIDTH, height: TIER_HEIGHT };
}

// `column` may be fractional, which centres two boxes under three columns.
function serviceBox(top: number, column: number): Box {
	return { x: TIER_PADDING + column * TIER_COLUMN_PITCH, y: top, ...SERVICE };
}

function tierServiceBox(tierTop: number, column: number): Box {
	return serviceBox(tierTop + TIER_TITLE_HEIGHT, column);
}

/** Clients, an API gateway, a tier of services and a tier of data stores, joined by arrows. */
export function buildArchitecture(theme: DiagramTheme): DiagramSkeleton[] {
	const palette = paletteFor(theme);
	const tiers = [
		container(palette, "clients", tierBox(CLIENTS_TOP), "Clients"),
		container(palette, "services", tierBox(SERVICES_TOP), "Services"),
		container(palette, "data", tierBox(DATA_TOP), "Data"),
	];
	const web = node(palette, "web-app", tierServiceBox(CLIENTS_TOP, 0.5), "Web app");
	const mobile = node(palette, "mobile-app", tierServiceBox(CLIENTS_TOP, 1.5), "Mobile app");
	const gateway = node(palette, "gateway", serviceBox(GATEWAY_TOP, 1), "API gateway", { fill: "accent" });
	const auth = node(palette, "auth", tierServiceBox(SERVICES_TOP, 0), "Auth");
	const orders = node(palette, "orders", tierServiceBox(SERVICES_TOP, 1), "Orders");
	const notifications = node(palette, "notifications", tierServiceBox(SERVICES_TOP, 2), "Notifications");
	const cache = node(palette, "cache", tierServiceBox(DATA_TOP, 0), "Redis cache", { fill: "accent" });
	const database = node(palette, "database", tierServiceBox(DATA_TOP, 1), "Postgres", { fill: "accent" });
	const queue = node(palette, "queue", tierServiceBox(DATA_TOP, 2), "Job queue", { fill: "accent" });

	return [
		...tiers,
		web,
		mobile,
		gateway,
		auth,
		orders,
		notifications,
		cache,
		database,
		queue,
		connect(palette, "web-to-gateway", web, gateway),
		connect(palette, "mobile-to-gateway", mobile, gateway),
		connect(palette, "gateway-to-auth", gateway, auth),
		connect(palette, "gateway-to-orders", gateway, orders),
		connect(palette, "auth-to-cache", auth, cache),
		connect(palette, "orders-to-database", orders, database),
		connect(palette, "orders-to-queue", orders, queue),
		connect(palette, "queue-to-notifications", queue, notifications),
	];
}
