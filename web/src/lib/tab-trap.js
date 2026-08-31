// Tab cycles a card-editing surface's own stops only — the two sides and the
// buttons that end the edit — wrapping around. Everything the boards own (FEN
// inputs, the per-board buttons, an open board editor's controls) stays out of
// the cycle: they are reached by clicking or by the board caret, not by Tab.
// Escape releases the trap (WCAG 2.1.2) so native tabbing can leave the
// surface; focusing a stop again re-arms it.
//
// getStops returns the live stops in cycle order, each { el, focus }: el is
// what focus is compared against, focus() puts the caret there (a side's
// focusEnd, so tabbing into it lands at the end in one step).
//
// handleKeydown belongs on the capture phase, so ProseMirror never sees the
// Tab first; handleFocusIn on the same container.
export const createTabTrap = getStops => {
	let enabled = true;

	// focus inside a board sits inside the side's ProseMirror, so it counts as
	// that side's stop — tabbing out of a board lands on the next stop
	const stopOf = (stops, node) => stops.findIndex(({ el }) => el === node || el.contains(node));

	const handleKeydown = e => {
		if (e.key === "Escape") {
			enabled = false;
			document.activeElement?.blur();
			return;
		}
		if (e.key !== "Tab" || !enabled) return;
		const stops = getStops();
		if (stops.length === 0) return;
		e.preventDefault();
		const i = stopOf(stops, e.target);
		const next = e.shiftKey
			? stops[i <= 0 ? stops.length - 1 : i - 1]
			: stops[(i + 1) % stops.length];
		next.focus();
	}

	const handleFocusIn = e => {
		if (stopOf(getStops(), e.target) !== -1) enabled = true;
	}

	return { handleKeydown, handleFocusIn };
}
