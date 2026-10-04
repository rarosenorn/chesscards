// A card side reads from one edge as soon as anything on it does. A one-line
// paragraph centers (app.css) only while the whole side could: once a line
// anywhere on the side runs past its width, or the side has a list, or a
// lone board pinned to the left under a pair, every paragraph on the side
// reads from the column's edge. Otherwise a centered line would sit off the
// edge the rest reads from.
//
// Measured, not styled: CSS cannot tell a wrapped paragraph from a short one.
// A block's size never depends on the outcome, so re-measuring cannot feed
// back into itself.
const wraps = el => {
	const line = parseFloat(getComputedStyle(el).lineHeight);
	return el.getBoundingClientRect().height > line * 1.5;
}

const readsFromTheEdge = side =>
	side.querySelector(".text-block > :is(ul, ol)") != null
	|| (side.dataset.boardAlign === "left" && side.querySelector(".single-board-block") != null)
	|| [...side.querySelectorAll(".text-block > p")].some(wraps);

// Attached to each text block; the answer is the side's, so whichever block
// measures sets it on all of them.
export const alignByWrap = block => {
	const measure = () => {
		const side = block.closest(".card-side");
		const blocks = side ? side.querySelectorAll(".text-block") : [block];
		const left = side ? readsFromTheEdge(side)
			: block.querySelector(":scope > :is(ul, ol)") != null || [...block.querySelectorAll(":scope > p")].some(wraps);
		for (const each of blocks) each.classList.toggle("wraps", left);
	}
	measure();
	const resize = new ResizeObserver(measure);
	resize.observe(block);
	// {@html} swaps the content under the same element
	const mutation = new MutationObserver(measure);
	mutation.observe(block, { childList: true, subtree: true, characterData: true });
	// and a block or a board coming or going beside this one changes the
	// side's answer without touching this block
	const side = block.closest(".card-side");
	if (side) mutation.observe(side, { childList: true });
	return () => {
		resize.disconnect();
		mutation.disconnect();
	}
}
