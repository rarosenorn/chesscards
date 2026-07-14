// A board is { fen, moves: [san...], annotations: { [positionIndex]: { arrows, markers } } }.
// Boards saved before moves/annotations existed are bare FEN strings.
const newBoard = fen => ({ fen, moves: [], annotations: {} });

const normalizeBoard = board =>
	typeof board === "string"
		? newBoard(board)
		: { fen: board.fen, moves: board.moves ?? [], annotations: board.annotations ?? {} };

const getSideJson = side => {
	const sideForJson = side.map(block => ({
		type: block.type,
		content:
			block.type === "text" ? block.textEditor.getJson() :
			block.type === "chessboards" ? block.content : null
	}));
	return JSON.stringify(sideForJson);
}

// A side has content if it has atleast 1 non-empty text field or 1 chessboard
const sideHasContent = side => side.some(element =>
	(element.type === "text" && !element.textEditor.isEmpty()) ||
	(element.type === "chessboards" && element.content.length > 0)
);

const countBoards = side => side.reduce(
	(n, block) => block.type === "chessboards" ? n + block.content.length : n, 0
);

const boardsBefore = (side, blockIndex) => countBoards(side.slice(0, blockIndex));

export { newBoard, normalizeBoard, getSideJson, sideHasContent, countBoards, boardsBefore }
