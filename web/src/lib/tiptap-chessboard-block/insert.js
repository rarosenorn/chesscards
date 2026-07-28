import { newBoard } from "$lib/card-utils.js"
import { startFen } from "$lib/tiptap-chessboard.svelte.js"
import { boardCaret } from "$lib/block-caret-state.svelte.js"
import { insertBlockWithBoards, findBlock, boardsOf, setBoards, virtualActive } from "./caret.js"

// insert a fresh one-board block (its editor open) at the caret's line:
// replacing an empty line, or after the current one. The document keeps
// focus with the caret parked (hidden) at the new board's right, so the
// keyboard keeps working like outside an editor.
export const insertChessboardBlock = (editor, ui) => {
	const board = newBoard(startFen);
	ui?.editingIds.add(board.id);
	insertBlockWithBoards(editor.view, [board]);
}

// insert at an active virtual gap goes INTO the block (Mod-k, toolbar)
export const insertBoardAtCaret = (editor, ui) => {
	const state = editor.view.state;
	if (!virtualActive(state)) return false;
	const block = findBlock(state);
	const board = newBoard(startFen);
	ui?.editingIds.add(board.id);
	const boards = boardsOf(block);
	const i = boardCaret.index;
	boardCaret.index = i + 1;
	boardCaret.anchor = null;
	setBoards(editor.view, block, [...boards.slice(0, i), board, ...boards.slice(i)]);
	return true;
}
