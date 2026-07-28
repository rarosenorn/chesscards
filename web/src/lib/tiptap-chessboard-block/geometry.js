// Shared DOM geometry for a chessboard block's board grid. The caret keymap
// (entering a block vertically, keeping the x while moving through rows) and
// ChessboardBlockNode's sweep selection both answer "which caret gap is
// nearest this point" — with the same math, from here.
//
// A gap index is a caret position between boards: 0 = before the first
// board, boards.length = after the last. On a row wrap one index has two
// visual spots; "affinity" picks between end-of-upper-row ("up") and
// start-of-lower-row ("down").

// boards per grid row
export const COLS = 2;

// the caret bar renders this far outside the board face
export const CARET_GAP_PX = 5;

// the caret bar's nominal thickness; rendered as whole device pixels (with
// the ink lightened to compensate any overshoot) so every spot rasterizes
// identically at fractional zoom
export const CARET_WIDTH_PX = 1.25;

export const blockCells = blockId =>
	[...document.querySelectorAll(`.board-block[data-block-id="${blockId}"] .board-cell`)];

// cells grouped into visual rows (top to bottom), each row's cells left to
// right as { index, rect } where index is the board's position in the block
export const cellRows = cells => {
	const rows = [];
	cells.forEach((el, index) => {
		const rect = el.getBoundingClientRect();
		const row = rows.find(r => Math.abs(r.top - rect.top) < 2);
		if (row) row.cells.push({ index, rect });
		else rows.push({ top: rect.top, cells: [{ index, rect }] });
	});
	rows.sort((a, b) => a.top - b.top);
	for (const row of rows) row.cells.sort((a, b) => a.rect.left - b.rect.left);
	return rows;
};

// the row containing y, or the closest one by vertical distance
export const rowNearestY = (rows, y) => {
	const distance = row => Math.max(row.cells[0].rect.top - y, y - row.cells[0].rect.bottom, 0);
	return rows.reduce((a, b) => distance(b) < distance(a) ? b : a);
};

// a row's caret gaps: one at each cell's left edge, one after the last cell
const rowGaps = row => {
	const gaps = row.cells.map(c => ({ index: c.index, x: c.rect.left, affinity: "down" }));
	const last = row.cells[row.cells.length - 1];
	gaps.push({ index: last.index + 1, x: last.rect.right, affinity: "up" });
	return gaps;
};

export const nearestGapInRow = (row, x) =>
	rowGaps(row).reduce((a, b) => Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a);

// nearest gap of the block's first or last row — vertical entry into a block
export const nearestGapAtEdge = (blockId, x, edge) => {
	const rows = cellRows(blockCells(blockId));
	if (!rows.length) return 0;
	return nearestGapInRow(edge === "first" ? rows[0] : rows[rows.length - 1], x).index;
};

// screen x of a gap, honouring wrap-boundary affinity like the rendered caret
export const gapScreenX = (blockId, index, affinity) => {
	const rects = blockCells(blockId).map(el => el.getBoundingClientRect());
	const after = index > 0 ? rects[index - 1] : null;
	const before = rects[index] ?? null;
	if (affinity === "down" && before) return before.left;
	if (after) return after.right;
	return before ? before.left : 0;
};
