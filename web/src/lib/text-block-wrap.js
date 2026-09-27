// A card's text block reads from one edge as soon as any of it runs past a
// line: a one-line paragraph only centers (app.css) while everything around
// it, up to the next board, fits on a line too. Otherwise a centered line
// would sit off the edge the wrapped text below it reads from.
//
// Measured, not styled: CSS cannot tell a wrapped paragraph from a short one.
// The block's width never depends on the outcome, so re-measuring cannot
// feed back into itself.
const wraps = el => {
	const line = parseFloat(getComputedStyle(el).lineHeight);
	return el.getBoundingClientRect().height > line * 1.5;
}

export const alignByWrap = block => {
	const measure = () => {
		const lines = block.querySelectorAll(":scope > p, :scope > :is(ul, ol) > li");
		block.classList.toggle("wraps", [...lines].some(wraps));
	}
	measure();
	const resize = new ResizeObserver(measure);
	resize.observe(block);
	// {@html} swaps the content under the same element
	const mutation = new MutationObserver(measure);
	mutation.observe(block, { childList: true, subtree: true, characterData: true });
	return () => {
		resize.disconnect();
		mutation.disconnect();
	}
}
