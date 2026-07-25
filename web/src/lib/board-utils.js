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

// Applies a free-form move directly on the FEN — the piece must move the way
// it moves in chess (patterns, clear paths), but turn order and check rules
// are ignored, auto-queen promotion — and hands the turn to the other side.
// Works on positions chess.js cannot even hold (e.g. two same-color kings),
// which is why it avoids chess.js entirely.
// Returns { san, fen } (san for display only) or null if impossible.
const expandPlacement = placement =>
	placement.split("/").map(rank =>
		[...rank].flatMap(ch => (ch >= "1" && ch <= "8") ? Array(Number(ch)).fill(null) : [ch]));

const compressPlacement = grid =>
	grid.map(rank => {
		let out = "", empty = 0;
		for (const cell of rank) {
			if (cell === null) { empty += 1; continue; }
			if (empty) { out += empty; empty = 0; }
			out += cell;
		}
		return empty ? out + empty : out;
	}).join("/");

const squareIndex = square => ({ rank: 8 - Number(square[1]), file: square.charCodeAt(0) - 97 });

// geometry only: does this piece move that way, with a clear path where the
// piece can't jump? (turn and check rules deliberately not enforced)
const isPieceMovePattern = (grid, piece, f, t, captured) => {
	const dr = t.rank - f.rank, df = t.file - f.file;
	const adr = Math.abs(dr), adf = Math.abs(df);
	const clearPath = () => {
		const sr = Math.sign(dr), sf = Math.sign(df);
		let rank = f.rank + sr, file = f.file + sf;
		while (rank !== t.rank || file !== t.file) {
			if (grid[rank][file]) return false;
			rank += sr;
			file += sf;
		}
		return true;
	};
	switch (piece.toLowerCase()) {
		case "n": return (adr === 1 && adf === 2) || (adr === 2 && adf === 1);
		case "k": return adr <= 1 && adf <= 1;
		case "r": return (dr === 0 || df === 0) && clearPath();
		case "b": return adr === adf && clearPath();
		case "q": return (dr === 0 || df === 0 || adr === adf) && clearPath();
		case "p": {
			const forward = piece === "P" ? -1 : 1;
			if (df === 0 && dr === forward && !captured) return true;
			const startRank = piece === "P" ? 6 : 1;
			if (df === 0 && dr === 2 * forward && f.rank === startRank && !captured
				&& !grid[f.rank + forward][f.file]) return true;
			return adf === 1 && dr === forward && !!captured;
		}
	}
	return false;
}

const applyFreeMove = (fen, from, to) => {
	const parts = fen.trim().split(/\s+/);
	const grid = expandPlacement(parts[0]);
	const f = squareIndex(from), t = squareIndex(to);
	const piece = grid[f.rank][f.file];
	if (!piece || from === to) return null;
	const captured = grid[t.rank][t.file];
	const isWhite = piece === piece.toUpperCase();
	if (captured && (captured === captured.toUpperCase()) === isWhite) return null;
	if (!isPieceMovePattern(grid, piece, f, t, captured)) return null;
	const promotes = piece.toLowerCase() === "p" && (to[1] === "1" || to[1] === "8");
	grid[f.rank][f.file] = null;
	grid[t.rank][t.file] = promotes ? (isWhite ? "Q" : "q") : piece;
	parts[0] = compressPlacement(grid);
	parts[1] = isWhite ? "b" : "w";
	parts[3] = "-";
	if (!isWhite) parts[5] = String(Number(parts[5]) + 1);
	const letter = piece.toLowerCase() === "p" ? (captured ? from[0] : "") : piece.toUpperCase();
	return {
		san: letter + (captured ? "x" : "") + to + (promotes ? "=Q" : ""),
		fen: parts.join(" "),
		color: isWhite ? "w" : "b"
	};
}

// Replays board.moves from board.fen. Returns one FEN per position (index 0 =
// start position) and, per move, its SAN, mover color and fullmove number for
// move-list display. Falls back to just the start position if the FEN or a
// move is invalid for chess.js.
const replayMoves = board => {
	const fens = [board.fen];
	const moveInfos = [];
	try {
		let currentFen = board.fen;
		for (const stored of board.moves) {
			const coordinate = stored.match(MANUAL_MOVE_PATTERN);
			if (coordinate) {
				// coordinate moves replay without chess.js, so they work on
				// positions it can't represent
				const number = Number(currentFen.trim().split(/\s+/)[5]);
				const result = applyFreeMove(currentFen, coordinate[1], coordinate[2]);
				if (!result) throw new Error(`invalid manual move ${stored}`);
				moveInfos.push({ san: result.san, color: result.color, number });
				currentFen = result.fen;
				fens.push(currentFen);
				continue;
			}
			const chess = looseChess(currentFen);
			const flipped = stored.startsWith(FLIPPED_MOVE_PREFIX);
			if (flipped) chess.load(flipTurn(chess.fen()), { skipValidation: true });
			const san = flipped ? stored.slice(FLIPPED_MOVE_PREFIX.length) : stored;
			const color = chess.turn();
			const number = chess.moveNumber();
			chess.move(san);
			moveInfos.push({ san, color, number });
			currentFen = chess.fen();
			fens.push(currentFen);
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

export { FLIPPED_MOVE_PREFIX, flipTurn, looseChess, applyFreeMove, replayMoves, serializeAnnotations, hasAnnotations, showAnnotations }
