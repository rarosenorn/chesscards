// The add-cards editor's virtual board caret state. The caret lives at gap
// indices inside one chessboard block (0 = before the first board,
// boards.length = after the last). anchor is the selection anchor gap while
// shift-extending (null = no range); affinity picks the visual spot when a
// gap sits on a 2-per-row wrap boundary ("down" = start of lower row, "up" =
// end of upper). Keyboard behavior: tiptap-chessboard-block/caret.js;
// rendering and pointer interactions: ChessboardBlockNode.svelte.
export const boardCaret = $state({
	blockId: null,
	index: 0,
	anchor: null,
	affinity: "down"
});

export const clearBoardCaret = () => {
	boardCaret.blockId = null;
	boardCaret.anchor = null;
};

export const setBoardCaret = (blockId, index, affinity = "down") => {
	boardCaret.blockId = blockId;
	boardCaret.index = index;
	boardCaret.anchor = null;
	boardCaret.affinity = affinity;
};

// selected board indices [from, to) while a shift-range is active
export const caretRange = () => {
	if (boardCaret.blockId == null || boardCaret.anchor == null) return null;
	const a = Math.min(boardCaret.anchor, boardCaret.index);
	const b = Math.max(boardCaret.anchor, boardCaret.index);
	return a === b ? null : { from: a, to: b };
};

// single-board/range clipboard shared across blocks and sides
export const boardClipboard = { boards: null };
