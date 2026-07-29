import { ttGenerateText } from "./tiptap-utility.js"
import { isValidFen } from "./isValidFen.js"

// A board is { fen, moves: [san...], annotations: { [positionIndex]: { arrows, markers } },
// solutionFrom, solutionAnnotations, orientation: "w" | "b" }.
// The solution layer belongs to the back: moves[solutionFrom..] are hidden in
// study until the card is turned (null = no hidden moves), and on turning
// solutionAnnotations displaces annotations per position. Boards saved before
// these fields existed are bare FEN strings or lack the newer fields.
// In the editor a board also carries a client-only id (for keying, editing
// state and drag and drop); getSideJson strips it before saving.
const newBoard = fen => ({
	id: crypto.randomUUID(),
	fen,
	moves: [],
	annotations: {},
	solutionFrom: null,
	solutionAnnotations: {},
	orientation: "w"
});

const normalizeBoard = board =>
	typeof board === "string"
		? newBoard(board)
		: {
			id: board.id ?? crypto.randomUUID(),
			fen: board.fen,
			moves: board.moves ?? [],
			annotations: board.annotations ?? {},
			solutionFrom: board.solutionFrom ?? null,
			solutionAnnotations: board.solutionAnnotations ?? {},
			orientation: board.orientation ?? "w"
		};

// empty solution layers are omitted from the stored JSON
const boardForJson = ({ fen, moves, annotations, solutionFrom, solutionAnnotations, orientation }) => ({
	fen, moves, annotations, orientation,
	...(solutionFrom != null && { solutionFrom }),
	...(Object.keys(solutionAnnotations ?? {}).length > 0 && { solutionAnnotations })
});

// Add cards 3: a side is one tiptap doc (boards as PM nodes). Convert to the
// stored block-array format so storage/study/browse are untouched: contiguous
// non-board top-level nodes become one text block, each boardGrid a
// chessboards block.
const docToSide = doc => {
	const blocks = [];
	let textNodes = [];
	const flushText = () => {
		const content = { type: "doc", content: textNodes };
		if (textNodes.length > 0 && ttGenerateText(content).trim().length > 0) {
			blocks.push({ type: "text", content });
		}
		textNodes = [];
	}
	for (const node of doc.content ?? []) {
		if (node.type === "boardGrid") {
			flushText();
			const boards = (node.content ?? []).map(n => n.attrs?.data).filter(Boolean);
			if (boards.length > 0) blocks.push({ type: "chessboards", content: boards.map(boardForJson) });
		} else {
			textNodes.push(node);
		}
	}
	flushText();
	return blocks;
}

const docSideJson = doc => JSON.stringify(docToSide(doc));

const docHasContent = doc => docToSide(doc).length > 0;

// Add cards 4: boards are inline nodes inside paragraphs. A paragraph mixing
// text and boards splits, in order, into text blocks and chessboards blocks;
// board nodes are stripped from anything bound for a text block (the text
// renderers don't know them).
const stripBoards = node => node.content
	? { ...node, content: node.content.filter(n => n.type !== "chessboard").map(stripBoards) }
	: node;

const docToSideInline = doc => {
	const blocks = [];
	let textNodes = [];
	const flushText = () => {
		const content = { type: "doc", content: textNodes };
		if (textNodes.length > 0 && ttGenerateText(content).trim().length > 0) {
			blocks.push({ type: "text", content });
		}
		textNodes = [];
	}
	for (const node of doc.content ?? []) {
		if (node.type === "paragraph" && (node.content ?? []).some(n => n.type === "chessboard")) {
			let run = [];
			let boards = [];
			const flushRun = () => {
				if (run.length > 0) textNodes.push({ type: "paragraph", content: run });
				run = [];
			}
			const flushBoards = () => {
				if (boards.length > 0) {
					flushText();
					blocks.push({ type: "chessboards", content: boards.map(boardForJson) });
				}
				boards = [];
			}
			for (const child of node.content) {
				if (child.type === "chessboard") {
					flushRun();
					if (child.attrs?.data) boards.push(child.attrs.data);
				} else {
					flushBoards();
					run.push(child);
				}
			}
			flushRun();
			flushBoards();
		} else {
			textNodes.push(stripBoards(node));
		}
	}
	flushText();
	return blocks;
}

const docSideJsonInline = doc => JSON.stringify(docToSideInline(doc));

const docHasContentInline = doc => docToSideInline(doc).length > 0;

// Add cards 5: a chessboardBlock node's boards array maps 1:1 to a stored
// chessboards block
const docToSideBlocks = doc => {
	const blocks = [];
	let textNodes = [];
	const flushText = () => {
		const content = { type: "doc", content: textNodes };
		if (textNodes.length > 0 && ttGenerateText(content).trim().length > 0) {
			blocks.push({ type: "text", content });
		}
		textNodes = [];
	}
	for (const node of doc.content ?? []) {
		if (node.type === "chessboardBlock") {
			flushText();
			const boards = node.attrs?.boards ?? [];
			if (boards.length > 0) blocks.push({ type: "chessboards", content: boards.map(boardForJson) });
		} else {
			textNodes.push(node);
		}
	}
	flushText();
	return blocks;
}

const docSideJsonBlocks = doc => JSON.stringify(docToSideBlocks(doc));

// the inverse, for editing an existing card in the block editor: stored side
// blocks become one document (chessboardBlock nodes get fresh client ids and
// normalized boards); an empty side becomes a single empty line
const sideToDoc = side => {
	const content = [];
	for (const block of side ?? []) {
		if (block.type === "chessboards") {
			content.push({
				type: "chessboardBlock",
				attrs: { id: crypto.randomUUID(), boards: block.content.map(normalizeBoard) }
			});
		} else if (block.type === "text") {
			content.push(...(block.content?.content ?? []));
		}
	}
	if (content.length === 0) content.push({ type: "paragraph" });
	return { type: "doc", content };
}

const docHasContentBlocks = doc => docToSideBlocks(doc).length > 0;

const docCountBoardsBlocks = doc => (doc?.content ?? []).reduce(
	(n, node) => node.type === "chessboardBlock" ? n + (node.attrs?.boards?.length ?? 0) : n, 0
);

// v1's invalid-FEN gating over a blocks doc: display numbers of boards whose
// FEN is invalid — live in an open editor (ui.invalidBoards) or pending in
// fenInput otherwise
const docInvalidBoardNumbersBlocks = (doc, offset, ui) => {
	const numbers = [];
	let n = offset;
	for (const node of doc?.content ?? []) {
		if (node.type !== "chessboardBlock") continue;
		for (const board of node.attrs?.boards ?? []) {
			n += 1;
			const invalid = ui.editingIds.has(board.id)
				? ui.invalidBoards?.[board.id]
				: board.fenInput != null && !isValidFen(board.fenInput);
			if (invalid) numbers.push(n);
		}
	}
	return numbers;
}

const getSideJson = side => {
	const sideForJson = side.map(block => ({
		type: block.type,
		content:
			block.type === "text" ? block.textEditor.getJson() :
			block.type === "chessboards" ? block.content.map(boardForJson) :
			null
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

export { newBoard, normalizeBoard, getSideJson, docSideJson, docHasContent, docSideJsonInline, docHasContentInline, docSideJsonBlocks, sideToDoc, docHasContentBlocks, docCountBoardsBlocks, docInvalidBoardNumbersBlocks, sideHasContent, syncTextBlocks, countBoards, boardsBefore, invalidBoardNumbers, invalidFenMessage }
