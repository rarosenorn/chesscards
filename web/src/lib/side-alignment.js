// One reading axis per card side. A side is centered while everything on it
// is small enough to sit centered without looking astray — a one-line prompt,
// a lone board — and switches to left-aligned as soon as anything on it is
// wide: then every text block and every board starts at the same left edge
// instead of each finding its own center.
//
// The two run independently: text is decided by measurement (whether any text
// block wraps, which depends on the rendered width), boards by the card's own
// data (whether any block holds more than one board).

// a block's line count: its paragraphs and list items, each possibly wrapped
const linesIn = block => {
	let lines = 0;
	for (const el of block.querySelectorAll("p, li")) {
		const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
		const height = el.getBoundingClientRect().height;
		lines += lineHeight > 0 ? Math.max(1, Math.round(height / lineHeight)) : 1;
		if (lines > 1) return lines;
	}
	return lines;
}

// Svelte action: stamps data-text-align on the side container, re-measuring
// when the side resizes (a narrower card wraps text that used to fit) and
// whenever the caller's dependency changes (a different card, an edit).
const textAlignment = (node, deps) => {
	const sync = () => {
		const wrapped = [...node.querySelectorAll(".text-block")].some(b => linesIn(b) > 1);
		node.dataset.textAlign = wrapped ? "left" : "center";
	}
	sync();
	const observer = new ResizeObserver(sync);
	observer.observe(node);
	return {
		// the DOM is already patched when this runs, so a re-measure here sees
		// the new text
		update: () => sync(),
		destroy: () => observer.disconnect()
	};
}

// data-board-align's value: any block with more than one board pins the whole
// side left, so a single board below a pair does not sit off in the middle
const boardAlignment = side =>
	(side ?? []).some(block => block.type === "chessboards" && block.content.length > 1)
		? "left"
		: "center";

export { textAlignment, boardAlignment }
