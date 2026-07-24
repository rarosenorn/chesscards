import { ttGenerateText } from "./tiptap-utility.js"
import { isValidFen } from "./isValidFen.js"

// A board is { fen, moves: [san...], annotations: { [positionIndex]: { arrows, markers } },
// orientation: "w" | "b" }. Boards saved before moves/annotations/orientation
// existed are bare FEN strings or lack the newer fields.
// In the editor a board also carries a client-only id (for keying, editing
// state and drag and drop); getSideJson strips it before saving.
const newBoard = fen => ({ id: crypto.randomUUID(), fen, moves: [], annotations: {}, orientation: "w" });

const normalizeBoard = board =>
	typeof board === "string"
		? newBoard(board)
		: { id: board.id ?? crypto.randomUUID(), fen: board.fen, moves: board.moves ?? [], annotations: board.annotations ?? {}, orientation: board.orientation ?? "w" };

const getSideJson = side => {
	const sideForJson = side.map(block => ({
		type: block.type,
		content:
			block.type === "text" ? block.textEditor.getJson() :
			block.type === "chessboards"
				? block.content.map(({ fen, moves, annotations, orientation }) => ({ fen, moves, annotations, orientation }))
				: null
	}));
	return JSON.stringify(sideForJson);
}

// flush live tiptap editors into block state, so text survives the editor
// components unmounting (drag re-renders, tab navigation)
const syncTextBlocks = side => {
	for (const block of side) {
		if (block.type === "text" && block.textEditor) {
			// getJson is undefined-safe around the editor's mount lifecycle;
			// never clobber synced content with undefined
			block.content = block.textEditor.getJson() ?? block.content;
		}
	}
}

// without a live editor (unmounted page holding a draft) fall back to the
// last synced content
const textBlockHasContent = block =>
	block.textEditor
		? !block.textEditor.isEmpty()
		: !!block.content && ttGenerateText(block.content).trim().length > 0;

// A side has content if it has atleast 1 non-empty text field or 1 chessboard
const sideHasContent = side => side.some(element =>
	(element.type === "text" && textBlockHasContent(element)) ||
	(element.type === "chessboards" && element.content.length > 0)
);

// display numbers (1-based; a back side continues the front's count via
// offset) of the side's boards holding an invalid FEN: reported live by an
// open editor (cardDnd.invalidBoards), or pending in fenInput otherwise
const invalidBoardNumbers = (side, offset, cardDnd) => {
	const numbers = [];
	let n = offset;
	for (const block of side) {
		if (block.type !== "chessboards") continue;
		for (const board of block.content) {
			n += 1;
			const invalid = cardDnd.editingBoards.includes(board.id)
				? cardDnd.invalidBoards[board.id]
				: board.fenInput != null && !isValidFen(board.fenInput);
			if (invalid) numbers.push(n);
		}
	}
	return numbers;
}

const invalidFenMessage = numbers =>
	numbers.length > 1
		? `Boards ${numbers.join(", ")} have invalid FENs`
		: `Board ${numbers[0]} has an invalid FEN`;

const countBoards = side => side.reduce(
	(n, block) => block.type === "chessboards" ? n + block.content.length : n, 0
);

const boardsBefore = (side, blockIndex) => countBoards(side.slice(0, blockIndex));

export { newBoard, normalizeBoard, getSideJson, sideHasContent, syncTextBlocks, countBoards, boardsBefore, invalidBoardNumbers, invalidFenMessage }
