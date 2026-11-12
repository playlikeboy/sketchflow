"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	buildDeck,
	firstSlideIndex,
	lastSlideIndex,
	slideActionForKey,
	slideAnnouncement,
	slideFitZoom,
	slideIndexAfter,
	slidePositionLabel,
	type Deck,
	type Size,
	type Slide,
	type SlideAction,
} from "@/lib/presentation";
import { cn } from "@/lib/utils";

export type PresentationModeProps = {
	/** The live canvas, or null while it is loading. */
	api: ExcalidrawImperativeAPI | null;
	/** Whether the presentation is running. */
	active: boolean;
	/** Called when the person leaves the presentation (Escape or the close button). */
	onExit: () => void;
};

/** How much of the viewport a slide fills along its limiting side; the rest is margin. */
const SLIDE_VIEWPORT_FILL = 0.94;
const SLIDE_TRANSITION_MS = 320;
/** Waits out a burst of resize events before the fallback re-fit. */
const REFIT_DELAY_MS = 120;
const CONTROLS_IDLE_MS = 2500;

const EMPTY_SKETCH_MESSAGE = "There is nothing on this sketch to present yet.";
const NO_FRAMES_HINT = "Add frames (F) to split this sketch into slides.";
const EDITABLE_SELECTOR = "input, textarea, select";
const CONTROL_SELECTOR = "button, a[href], summary, [role='button'], [role='link'], [role='menuitem'], [role='tab']";

type CanvasView = Pick<AppState, "scrollX" | "scrollY" | "zoom">;

function readView(api: ExcalidrawImperativeAPI): CanvasView {
	const { scrollX, scrollY, zoom } = api.getAppState();
	return { scrollX, scrollY, zoom };
}

function restoreView(api: ExcalidrawImperativeAPI, view: CanvasView) {
	try {
		// A slide transition still in flight would keep writing scroll and zoom after the restore.
		// Excalidraw only exposes cancelling it as a side effect of another scrollToContent call.
		api.scrollToContent([], { animate: false });
		api.updateScene({ appState: view });
	} catch {
		// The canvas was torn down along with this component, so there is no view left to restore.
	}
}

/** The canvas viewport as Excalidraw last measured it, which is what scrollToContent fits against. */
function viewportSize(api: ExcalidrawImperativeAPI): Size {
	const { width, height } = api.getAppState();
	return { width, height };
}

function prefersReducedMotion(): boolean {
	return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** Fits one slide to the canvas viewport: its frame, or every element when the slide is the whole sketch. */
function fitSlide(api: ExcalidrawImperativeAPI, slide: Slide, animate: boolean) {
	const elements = api.getSceneElements();
	const frame = slide.frameId === null ? undefined : elements.find((element) => element.id === slide.frameId);
	const motion = { animate, duration: SLIDE_TRANSITION_MS };

	if (!frame) {
		api.scrollToContent(elements, { fitToViewport: true, viewportZoomFactor: SLIDE_VIEWPORT_FILL, ...motion });
		return;
	}

	// scrollToContent rounds its zoom down to a whole 0.1 step, which leaves a large frame much
	// smaller than the screen. Pinning min and max to the exact fit keeps the margin the same
	// for every frame size.
	const zoom = slideFitZoom(frame, viewportSize(api), SLIDE_VIEWPORT_FILL);
	const exactZoom = zoom === null ? {} : { minZoom: zoom, maxZoom: zoom };
	api.scrollToContent(frame, { fitToViewport: true, viewportZoomFactor: SLIDE_VIEWPORT_FILL, ...exactZoom, ...motion });
}

/**
 * The overlay is rendered directly inside the canvas container, so putting that container full
 * screen shows the canvas and these controls, and none of the editor around them.
 */
function fullscreenTargetFor(overlay: HTMLElement | null): HTMLElement {
	return overlay?.parentElement ?? document.documentElement;
}

async function enterFullscreen(target: HTMLElement): Promise<void> {
	try {
		await target.requestFullscreen?.();
	} catch {
		// The browser may refuse (no user gesture, an iframe without permission, iOS Safari).
		// The presentation then simply runs in the window.
	}
}

function leaveFullscreen(target: HTMLElement) {
	if (document.fullscreenElement !== target) return;
	// A rejection only means the browser had already left full screen.
	document.exitFullscreen?.().catch(() => undefined);
}

function isEditable(target: EventTarget | null): boolean {
	return target instanceof HTMLElement && (target.isContentEditable || target.matches(EDITABLE_SELECTOR));
}

function isActivationOfControl(event: KeyboardEvent): boolean {
	const isActivationKey = event.key === "Enter" || event.key === " ";
	return isActivationKey && event.target instanceof Element && event.target.closest(CONTROL_SELECTOR) !== null;
}

/** Calls `onExit` at most once for the life of the session, whichever route asks first. */
function useExitOnce(onExit: () => void): () => void {
	const onExitRef = useRef(onExit);
	const hasExitedRef = useRef(false);

	useEffect(() => {
		onExitRef.current = onExit;
	}, [onExit]);

	return useCallback(() => {
		if (hasExitedRef.current) return;
		hasExitedRef.current = true;
		onExitRef.current();
	}, []);
}

/** Moves focus into the presentation, then puts the canvas view and the focus back when it ends. */
function useRestoreOnEnd(api: ExcalidrawImperativeAPI, view: CanvasView, overlayRef: RefObject<HTMLElement | null>) {
	useEffect(() => {
		const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		overlayRef.current?.focus({ preventScroll: true });

		return () => {
			restoreView(api, view);
			if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
		};
	}, [api, view, overlayRef]);
}

/**
 * Asks for full screen while the session lives and leaves it again afterwards, but only if this
 * session entered it. Leaving full screen by the browser's own means ends the presentation.
 */
function useFullscreen(overlayRef: RefObject<HTMLElement | null>, isEnabled: boolean, requestExit: () => void) {
	const isLiveRef = useRef(false);

	useEffect(() => {
		if (!isEnabled) return;

		const target = fullscreenTargetFor(overlayRef.current);
		const shouldRequest = document.fullscreenElement === null;
		let isOurs = false;
		let isDisposed = false;
		isLiveRef.current = true;

		const handleChange = () => {
			if (document.fullscreenElement === target) {
				isOurs = shouldRequest;
				return;
			}
			if (!isOurs) return;
			isOurs = false;
			requestExit();
		};

		document.addEventListener("fullscreenchange", handleChange);
		if (shouldRequest) {
			void enterFullscreen(target).then(() => {
				// Granted only after the session had already ended: nobody is left to leave it.
				if (isDisposed && !isLiveRef.current) leaveFullscreen(target);
			});
		}

		return () => {
			isDisposed = true;
			isLiveRef.current = false;
			document.removeEventListener("fullscreenchange", handleChange);
			if (shouldRequest) leaveFullscreen(target);
		};
	}, [overlayRef, isEnabled, requestExit]);
}

/** Shows the current slide, and fits it again whenever the canvas changes size. */
function useSlideFit(api: ExcalidrawImperativeAPI, slide: Slide | undefined) {
	const slideRef = useRef(slide);
	const hasShownSlideRef = useRef(false);

	useEffect(() => {
		slideRef.current = slide;
		if (!slide) return;

		const shouldAnimate = hasShownSlideRef.current && !prefersReducedMotion();
		hasShownSlideRef.current = true;
		fitSlide(api, slide, shouldAnimate);
	}, [api, slide]);

	useEffect(() => {
		let timer: number | undefined;
		let fittedSize = viewportSize(api);
		const refit = () => {
			fittedSize = viewportSize(api);
			if (slideRef.current) fitSlide(api, slideRef.current, false);
		};
		const scheduleRefit = () => {
			window.clearTimeout(timer);
			timer = window.setTimeout(refit, REFIT_DELAY_MS);
		};

		// Excalidraw fits against the viewport size it has measured, which trails the real resize.
		// Its change feed reports the moment that measurement lands, so the slide is fitted again
		// right then; the window listeners are the fallback for a browser where it never changes.
		const stopWatchingSize = api.onChange((_elements, appState) => {
			if (appState.width !== fittedSize.width || appState.height !== fittedSize.height) refit();
		});
		window.addEventListener("resize", scheduleRefit);
		document.addEventListener("fullscreenchange", scheduleRefit);

		return () => {
			window.clearTimeout(timer);
			stopWatchingSize();
			window.removeEventListener("resize", scheduleRefit);
			document.removeEventListener("fullscreenchange", scheduleRefit);
		};
	}, [api]);
}

/**
 * Handles the presenter's keys at the window, in the capture phase, so they never reach
 * Excalidraw (where arrows pan and letters are shortcuts). Typing in a field elsewhere in the
 * app, and Enter or Space on a focused control, keep their usual meaning.
 */
function usePresentationKeys(overlayRef: RefObject<HTMLElement | null>, onAction: (action: SlideAction) => void) {
	useEffect(() => {
		const handleKey = (event: KeyboardEvent) => {
			if (event.ctrlKey || event.metaKey || event.altKey) return;
			const action = slideActionForKey(event.key);
			if (!action || isEditable(event.target)) return;

			if (isActivationOfControl(event)) {
				const isOwnControl = event.target instanceof Node && overlayRef.current?.contains(event.target);
				if (isOwnControl) event.stopPropagation();
				return;
			}

			event.stopPropagation();
			event.preventDefault();
			if (event.type === "keydown") onAction(action);
		};

		window.addEventListener("keydown", handleKey, true);
		window.addEventListener("keyup", handleKey, true);
		return () => {
			window.removeEventListener("keydown", handleKey, true);
			window.removeEventListener("keyup", handleKey, true);
		};
	}, [overlayRef, onAction]);
}

/** True once the pointer has been still for `delay` milliseconds. */
function usePointerIdle(delay: number): boolean {
	const [isIdle, setIsIdle] = useState(false);

	useEffect(() => {
		let timer = window.setTimeout(() => setIsIdle(true), delay);
		const wake = () => {
			window.clearTimeout(timer);
			setIsIdle(false);
			timer = window.setTimeout(() => setIsIdle(true), delay);
		};
		const options = { capture: true, passive: true };

		window.addEventListener("pointermove", wake, options);
		window.addEventListener("pointerdown", wake, options);
		return () => {
			window.clearTimeout(timer);
			window.removeEventListener("pointermove", wake, options);
			window.removeEventListener("pointerdown", wake, options);
		};
	}, [delay]);

	return isIdle;
}

type BarButtonProps = {
	label: string;
	isDisabled?: boolean;
	onPress: () => void;
	children: ReactNode;
};

function BarButton({ label, isDisabled = false, onPress, children }: BarButtonProps) {
	// A mouse click must not take focus: with a bar button focused, Space and Enter would press
	// it again instead of moving to the next slide.
	const keepFocus = (event: MouseEvent) => event.preventDefault();
	const handleClick = () => {
		if (!isDisabled) onPress();
	};

	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-sm"
			aria-label={label}
			aria-disabled={isDisabled}
			title={label}
			className="aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent aria-disabled:hover:text-muted-foreground"
			onMouseDown={keepFocus}
			onClick={handleClick}
		>
			{children}
		</Button>
	);
}

type ControlBarProps = {
	deck: Deck;
	index: number;
	isIdle: boolean;
	onAction: (action: SlideAction) => void;
};

function ControlBar({ deck, index, isIdle, onAction }: ControlBarProps) {
	const count = deck.slides.length;
	const title = deck.slides[index]?.title ?? "";

	return (
		<div className="absolute inset-x-0 bottom-4 flex justify-center px-4">
			<div
				role="group"
				aria-label="Presentation controls"
				className={cn(
					"pointer-events-auto flex max-w-full flex-col items-center rounded-lg border border-rule bg-card/90 p-1 text-foreground shadow-lg backdrop-blur-sm transition-opacity duration-300 hover:opacity-100 focus-within:opacity-100",
					isIdle ? "opacity-30" : "opacity-100",
				)}
			>
				<div className="flex max-w-full items-center gap-1">
					<BarButton label="Previous slide" isDisabled={index <= firstSlideIndex()} onPress={() => onAction("previous")}>
						<ChevronLeft />
					</BarButton>
					<p className="flex min-w-0 items-baseline gap-1.5 px-2 text-sm">
						<span className="datum shrink-0">{slidePositionLabel(index, count)}</span>
						<span aria-hidden="true">·</span>
						<span className="max-w-[min(40vw,24rem)] truncate font-medium">{title}</span>
					</p>
					<BarButton label="Next slide" isDisabled={index >= lastSlideIndex(count)} onPress={() => onAction("next")}>
						<ChevronRight />
					</BarButton>
					<span className="mx-1 h-5 w-px shrink-0 bg-rule" aria-hidden="true" />
					<BarButton label="Exit presentation" onPress={() => onAction("exit")}>
						<X />
					</BarButton>
				</div>
				{deck.kind === "whole" ? <p className="px-2 pb-1 text-xs text-muted-foreground">{NO_FRAMES_HINT}</p> : null}
			</div>
		</div>
	);
}

function EmptyNotice({ onExit }: { onExit: () => void }) {
	return (
		<div className="absolute inset-0 grid place-items-center p-4">
			<div className="pointer-events-auto flex flex-col items-center gap-3 rounded-lg border border-rule bg-card/90 px-5 py-4 text-center text-foreground shadow-lg backdrop-blur-sm">
				<p className="text-sm">{EMPTY_SKETCH_MESSAGE}</p>
				<Button type="button" variant="outline" size="sm" onClick={onExit}>
					Exit
				</Button>
			</div>
		</div>
	);
}

type PresentationSessionProps = {
	api: ExcalidrawImperativeAPI;
	onExit: () => void;
};

/** One run of the presentation. Mounting it starts presenting; unmounting it puts everything back. */
function PresentationSession({ api, onExit }: PresentationSessionProps) {
	// Read once, before the first slide moves the canvas.
	const [{ deck, initialView }] = useState(() => ({ deck: buildDeck(api.getSceneElements()), initialView: readView(api) }));
	const [index, setIndex] = useState(firstSlideIndex());
	const overlayRef = useRef<HTMLElement>(null);
	const requestExit = useExitOnce(onExit);
	const isIdle = usePointerIdle(CONTROLS_IDLE_MS);

	const count = deck.slides.length;
	const slide = deck.slides.at(index);
	const isEmpty = deck.kind === "empty";

	const handleAction = useCallback(
		(action: SlideAction) => {
			if (action === "exit") {
				requestExit();
				return;
			}
			setIndex((current) => slideIndexAfter(action, current, count));
		},
		[requestExit, count],
	);

	useRestoreOnEnd(api, initialView, overlayRef);
	useFullscreen(overlayRef, !isEmpty, requestExit);
	useSlideFit(api, slide);
	usePresentationKeys(overlayRef, handleAction);

	const announcement = slide ? slideAnnouncement(index, count, slide.title) : EMPTY_SKETCH_MESSAGE;

	return (
		<section
			ref={overlayRef}
			tabIndex={-1}
			aria-label="Presentation"
			className="pointer-events-none absolute inset-0 z-40 outline-none"
		>
			<p className="sr-only" aria-live="polite">
				{announcement}
			</p>
			{isEmpty ? <EmptyNotice onExit={requestExit} /> : <ControlBar deck={deck} index={index} isIdle={isIdle} onAction={handleAction} />}
		</section>
	);
}

/** Steps through the sketch's frames as slides, full screen, with keyboard navigation. */
export function PresentationMode({ api, active, onExit }: PresentationModeProps) {
	const isWaitingForCanvas = active && !api;
	const hasGivenUpRef = useRef(false);

	// Asked to present before the canvas exists: there is nothing to show, so hand control back.
	useEffect(() => {
		if (!isWaitingForCanvas) {
			hasGivenUpRef.current = false;
			return;
		}
		if (hasGivenUpRef.current) return;
		hasGivenUpRef.current = true;
		onExit();
	}, [isWaitingForCanvas, onExit]);

	if (!active || !api) return null;

	// Keyed by canvas, so a replaced canvas starts a fresh session instead of driving a dead one.
	return <PresentationSession key={api.id} api={api} onExit={onExit} />;
}
