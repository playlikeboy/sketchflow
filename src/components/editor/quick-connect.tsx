"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type { ExcalidrawElement, ExcalidrawFlowchartNodeElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Plus } from "lucide-react";

import {
	connectElements,
	containingFrameId,
	findFreeSlot,
	handlePositions,
	insertConnected,
	isFullyVisible,
	obstacleBoxes,
	quickConnectTarget,
	type Box,
	type Direction,
	type HandlePosition,
} from "@/lib/quick-connect";

export type QuickConnectProps = {
	/** The live canvas, or null while it is loading. */
	api: ExcalidrawImperativeAPI | null;
	/** False when the canvas is read-only; the handles are then never shown. */
	enabled: boolean;
};

type Overlay = { api: ExcalidrawImperativeAPI; elementId: string; handles: HandlePosition[] };

const HANDLE_SIZE_PX = 20;
// A new shape closer than this to the edge of the canvas is scrolled into view, so the handles
// around it are reachable too.
const SCROLL_MARGIN_PX = 56;
// Excalidraw draws large resize handles on the middle of each side for touch input, exactly
// where these handles go, so they are offered to mouse and trackpad users only.
const FINE_POINTER_QUERY = "(pointer: fine)";
const MAX_VERSION_NONCE = 2 ** 31;

const HANDLE_TEXT: Record<Direction, { label: string; shortcut: string }> = {
	up: { label: "Add a connected shape above", shortcut: "Ctrl/Cmd + ↑" },
	right: { label: "Add a connected shape to the right", shortcut: "Ctrl/Cmd + →" },
	down: { label: "Add a connected shape below", shortcut: "Ctrl/Cmd + ↓" },
	left: { label: "Add a connected shape to the left", shortcut: "Ctrl/Cmd + ←" },
};

function subscribeToPointerKind(onChange: () => void) {
	const query = window.matchMedia(FINE_POINTER_QUERY);
	query.addEventListener("change", onChange);
	return () => query.removeEventListener("change", onChange);
}

function hasFinePointer() {
	return window.matchMedia(FINE_POINTER_QUERY).matches;
}

function readOverlay(api: ExcalidrawImperativeAPI): Overlay | null {
	const appState = api.getAppState();
	const target = quickConnectTarget(appState, api.getSceneElements());
	return target ? { api, elementId: target.id, handles: handlePositions(target, appState) } : null;
}

function overlaySignature(overlay: Overlay | null) {
	if (!overlay) return "hidden";
	return `${overlay.elementId}|${overlay.handles.map((handle) => `${handle.x},${handle.y}`).join("|")}`;
}

/**
 * Follows the canvas and reports where the handles belong. Excalidraw notifies on every state
 * change, including each pan and zoom step, so the work is done at most once per frame and
 * `publish` is called only when the result differs. Returns the function that stops it.
 */
function watchCanvas(api: ExcalidrawImperativeAPI, publish: (overlay: Overlay | null) => void) {
	let frame: number | null = null;
	let isPointerDown = false;
	let lastSignature: string | null = null;

	const update = () => {
		frame = null;
		// Hidden while a pointer is down on the canvas: the shape may be about to move.
		const overlay = isPointerDown ? null : readOverlay(api);
		const signature = overlaySignature(overlay);
		if (signature === lastSignature) return;
		lastSignature = signature;
		publish(overlay);
	};
	const schedule = () => {
		frame ??= requestAnimationFrame(update);
	};
	const setPointerDown = (isDown: boolean) => {
		isPointerDown = isDown;
		schedule();
	};

	// Excalidraw reports a release only through its own pointer-up handler, so a cancelled
	// press (the browser taking over a gesture, for example) would leave the handles hidden.
	const handlePointerCancel = () => setPointerDown(false);

	const unsubscribers = [
		api.onChange(schedule),
		api.onScrollChange(schedule),
		api.onPointerDown(() => setPointerDown(true)),
		api.onPointerUp(() => setPointerDown(false)),
	];
	window.addEventListener("pointercancel", handlePointerCancel);
	schedule();

	return () => {
		if (frame !== null) cancelAnimationFrame(frame);
		window.removeEventListener("pointercancel", handlePointerCancel);
		unsubscribers.forEach((unsubscribe) => unsubscribe());
	};
}

function isFlowchartNode(element: ExcalidrawElement): element is ExcalidrawFlowchartNodeElement {
	return element.type === "rectangle" || element.type === "diamond" || element.type === "ellipse";
}

function shapeSkeleton(original: ExcalidrawFlowchartNodeElement, slot: Box): ExcalidrawElementSkeleton {
	return {
		type: original.type,
		...slot,
		strokeColor: original.strokeColor,
		backgroundColor: original.backgroundColor,
		fillStyle: original.fillStyle,
		strokeWidth: original.strokeWidth,
		strokeStyle: original.strokeStyle,
		roughness: original.roughness,
		opacity: original.opacity,
		roundness: original.roundness,
	};
}

/** Styled like the arrow Excalidraw's own flowchart shortcut draws. `connectElements` places it. */
function arrowSkeleton(original: ExcalidrawFlowchartNodeElement, endArrowhead: AppState["currentItemEndArrowhead"]): ExcalidrawElementSkeleton {
	return {
		type: "arrow",
		x: 0,
		y: 0,
		strokeColor: original.strokeColor,
		strokeWidth: original.strokeWidth,
		strokeStyle: original.strokeStyle,
		roughness: original.roughness,
		opacity: original.opacity,
		startArrowhead: null,
		endArrowhead,
	};
}

/**
 * Adds a shape like the selected one in `direction`, joined to it by a bound arrow, and
 * selects it. The whole change is one undo step.
 */
async function addConnectedShape(api: ExcalidrawImperativeAPI, elementId: string, direction: Direction) {
	const { CaptureUpdateAction, convertToExcalidrawElements } = await import("@excalidraw/excalidraw");

	// Read after the import resolves, so the change is built from the scene as it is now.
	const appState = api.getAppState();
	const elements = api.getSceneElements();
	const original = quickConnectTarget(appState, elements);
	if (!original || original.id !== elementId || !isFlowchartNode(original)) return;

	const slot = findFreeSlot(original, direction, obstacleBoxes(elements, original.id));
	const frameId = containingFrameId(original, slot, elements);
	// Excalidraw builds the two new elements, so they carry every field it expects.
	const [shape, arrow] = convertToExcalidrawElements([shapeSkeleton(original, slot), arrowSkeleton(original, appState.currentItemEndArrowhead)]);
	if (!shape || arrow?.type !== "arrow") return;

	const connected = connectElements({
		original,
		shape,
		arrow,
		direction,
		frameId,
		stamp: { now: Date.now(), nonce: Math.floor(Math.random() * MAX_VERSION_NONCE) },
	});

	api.updateScene({
		elements: insertConnected<ExcalidrawElement>(api.getSceneElementsIncludingDeleted(), {
			original: connected.original,
			added: [connected.shape, connected.arrow],
			beforeId: frameId,
		}),
		appState: { selectedElementIds: { [connected.shape.id]: true as const } },
		// Recorded as one step, so a single undo removes the shape and the arrow together.
		captureUpdate: CaptureUpdateAction.IMMEDIATELY,
	});

	if (!isFullyVisible(slot, appState, SCROLL_MARGIN_PX)) {
		api.scrollToContent(connected.shape, { animate: true, fitToContent: false });
	}
}

function reportFailure(api: ExcalidrawImperativeAPI, error: unknown) {
	console.warn("A connected shape could not be added:", error);
	api.setToast({ message: "The connected shape could not be added. Try again.", closable: true });
}

type HandleButtonProps = {
	handle: HandlePosition;
	onAdd: (direction: Direction) => void;
};

function HandleButton({ handle, onAdd }: HandleButtonProps) {
	const { label, shortcut } = HANDLE_TEXT[handle.direction];
	const offset = HANDLE_SIZE_PX / 2;

	return (
		<button
			type="button"
			aria-label={label}
			title={`${label} (${shortcut})`}
			className="pointer-events-auto absolute top-0 left-0 grid cursor-pointer place-items-center rounded-full border border-rule bg-card text-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
			style={{ width: HANDLE_SIZE_PX, height: HANDLE_SIZE_PX, transform: `translate(${handle.x - offset}px, ${handle.y - offset}px)` }}
			// A mouse press must not take keyboard focus from the canvas, or its shortcuts
			// (Delete, Enter to label, Ctrl/Cmd + Arrow) would stop working after a click.
			onMouseDown={(event) => event.preventDefault()}
			onClick={() => onAdd(handle.direction)}
		>
			<Plus aria-hidden="true" className="size-3" strokeWidth={2.5} />
		</button>
	);
}

/**
 * "+" handles on the four sides of the selected shape that add a connected shape in that
 * direction. Rendered as an overlay positioned over the canvas container, which is
 * `position: relative`.
 */
export function QuickConnect({ api, enabled }: QuickConnectProps) {
	const isPointerFine = useSyncExternalStore(subscribeToPointerKind, hasFinePointer, () => false);
	const isActive = enabled && isPointerFine;
	const [overlay, setOverlay] = useState<Overlay | null>(null);

	useEffect(() => {
		if (!api || !isActive) {
			// Nothing to follow. Forget the last positions so they cannot reappear, stale, later.
			const frame = requestAnimationFrame(() => setOverlay(null));
			return () => cancelAnimationFrame(frame);
		}
		return watchCanvas(api, setOverlay);
	}, [api, isActive]);

	if (!api || !isActive || !overlay || overlay.api !== api) return null;

	const handleAdd = (direction: Direction) => {
		addConnectedShape(api, overlay.elementId, direction).catch((error: unknown) => reportFailure(api, error));
	};

	return (
		// z-3 is Excalidraw's own slot between its canvases (1 and 2) and its interface (4 and up),
		// so toolbars, menus, popovers and dialogs all stay above the handles.
		<div role="group" aria-label="Add a connected shape" className="pointer-events-none absolute inset-0 z-3 overflow-hidden">
			{overlay.handles.map((handle) => (
				<HandleButton key={handle.direction} handle={handle} onAdd={handleAdd} />
			))}
		</div>
	);
}
