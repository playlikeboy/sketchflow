/** The closest ancestor that scrolls vertically, or null when only the page does. */
export function nearestScroller(node: Element): HTMLElement | null {
	for (let ancestor = node.parentElement; ancestor; ancestor = ancestor.parentElement) {
		const { overflowY } = getComputedStyle(ancestor);
		if (overflowY === "auto" || overflowY === "scroll") {
			return ancestor;
		}
	}
	return null;
}
