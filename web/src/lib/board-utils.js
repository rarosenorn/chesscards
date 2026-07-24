import { Chess } from "chess.js"
import { ARROW_TYPE, MARKER_TYPE } from "cm-chessboard/src/extensions/right-click-annotator/RightClickAnnotator.js"

// A move recorded for the side that was not to move is stored with this
// prefix; replay flips the turn before applying it, so e.g. two black moves
// in a row round-trip exactly as they were recorded.
const FLIPPED_MOVE_PREFIX = "...";

// Hands the move to the other side: flips the turn and clears the en passant
// square (only valid for the side that was to move).
const flipTurn = fen => {
	const parts = fen.trim().split(/\s+/);
	parts[1] = parts[1] === "w" ? "b" : "w";
	parts[3] = "-";
	return parts.join(" ");
}

// Loads a FEN without chess.js's position validation, so free-form setup
// positions (missing kings, more than 8 pawns, ...) can record and replay
// moves; chess.js generates moves fine for them, it just skips check rules
// that need the absent pieces.
const looseChess = fen => {
	const chess = new Chess();
	chess.load(fen, { skipValidation: true });
	return chess;
}

// Moves chess.js refuses (e.g. moving into check) are stored as coordinates
// ("e2-e4"): SAN can't represent them, coordinates replay unambiguously.
const MANUAL_MOVE_PATTERN = /^([a-h][1-8])-([a-h][1-8])$/;

// Applies a free-form move — any piece to any square not holding its own
// color, check rules ignored — and hands the turn to the other side.
// Returns { san, fen } (san for display only) or null if impossible.
const manualMove = (chess, from, to) => {
	const piece = chess.get(from);
	if (!piece || from === to) return null;
	const captured = chess.get(to);
	if (captured && captured.color === piece.color) return null;
	// auto-queen, matching normal recording
	const promotes = piece.type === "p" && (to[1] === "1" || to[1] === "8");
	chess.remove(from);
	if (captured) chess.remove(to);
	chess.put({ type: promotes ? "q" : piece.type, color: piece.color }, to);
	const parts = chess.fen().split(/\s+/);
	parts[1] = piece.color === "w" ? "b" : "w";
	parts[3] = "-";
	if (piece.color === "b") parts[5] = String(Number(parts[5]) + 1);
	const fen = parts.join(" ");
	chess.load(fen, { skipValidation: true });
	const pieceLetter = piece.type === "p" ? (captured ? from[0] : "") : piece.type.toUpperCase();
	return { san: pieceLetter + (captured ? "x" : "") + to + (promotes ? "=Q" : ""), fen };
}

// Replays board.moves from board.fen. Returns one FEN per position (index 0 =
// start position) and, per move, its SAN, mover color and fullmove number for
// move-list display. Falls back to just the start position if the FEN or a
// move is invalid for chess.js.
const replayMoves = board => {
	const fens = [board.fen];
	const moveInfos = [];
	try {
		const chess = looseChess(board.fen);
		for (const stored of board.moves) {
			const coordinate = stored.match(MANUAL_MOVE_PATTERN);
			if (coordinate) {
				const color = chess.get(coordinate[1])?.color;
				const number = chess.moveNumber();
				const result = manualMove(chess, coordinate[1], coordinate[2]);
				if (!result) throw new Error(`invalid manual move ${stored}`);
				moveInfos.push({ san: result.san, color, number });
				fens.push(result.fen);
				continue;
			}
			const flipped = stored.startsWith(FLIPPED_MOVE_PREFIX);
			if (flipped) chess.load(flipTurn(chess.fen()), { skipValidation: true });
			const san = flipped ? stored.slice(FLIPPED_MOVE_PREFIX.length) : stored;
			const color = chess.turn();
			const number = chess.moveNumber();
			chess.move(san);
			moveInfos.push({ san, color, number });
			fens.push(chess.fen());
		}
	} catch {
		return { fens: [board.fen], moveInfos: [] };
	}
	return { fens, moveInfos };
}

// Annotations are stored with type keys ("success", "danger", ...) instead of
// cm-chessboard's type objects, so they serialize cleanly to JSON.
const arrowKeyFromType = type =>
	Object.keys(ARROW_TYPE).find(key => ARROW_TYPE[key].class === type.class);

const markerKeyFromType = type =>
	Object.keys(MARKER_TYPE).find(key => MARKER_TYPE[key].class === type.class);

const serializeAnnotations = ({ arrows, markers }) => ({
	arrows: arrows
		.map(({ type, from, to }) => ({ type: arrowKeyFromType(type), from, to }))
		.filter(arrow => arrow.type),
	markers: markers
		.map(({ type, square }) => ({ type: markerKeyFromType(type), square }))
		.filter(marker => marker.type)
});

const hasAnnotations = annotation =>
	annotation && (annotation.arrows?.length > 0 || annotation.markers?.length > 0);

// Draws the stored annotation for one position on a board that has the
// Arrows and Markers extensions, replacing whatever is currently drawn.
const showAnnotations = (chessboard, annotation) => {
	chessboard.removeArrows();
	// only the annotator's own marker types: a blanket removeMarkers() would
	// also wipe unrelated markers (e.g. the editor's picked-up-piece highlight)
	for (const key of Object.keys(MARKER_TYPE)) {
		chessboard.removeMarkers(MARKER_TYPE[key]);
	}
	for (const { type, from, to } of annotation?.arrows ?? []) {
		if (ARROW_TYPE[type]) chessboard.addArrow(ARROW_TYPE[type], from, to);
	}
	for (const { type, square } of annotation?.markers ?? []) {
		if (MARKER_TYPE[type]) chessboard.addMarker(MARKER_TYPE[type], square);
	}
}

export { FLIPPED_MOVE_PREFIX, flipTurn, looseChess, manualMove, replayMoves, serializeAnnotations, hasAnnotations, showAnnotations }
