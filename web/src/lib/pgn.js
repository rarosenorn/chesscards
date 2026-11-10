import { Chess } from "chess.js"
import { isValidFen } from "./isValidFen.js"

// A PGN pasted where a FEN goes, as a board: the position it starts from (its
// FEN tag, else the usual start) and its main line in SAN. Comments, clock
// times and variations are left behind. Null for a FEN, and for text that is
// not a PGN with a move or a position in it.
const boardFromPgn = text => {
	if (typeof text !== "string" || !text.trim() || isValidFen(text)) return null;
	const chess = new Chess();
	try {
		chess.loadPgn(text);
	} catch {
		return null;
	}
	const moves = chess.history({ verbose: true });
	if (moves.length === 0 && !chess.getHeaders().FEN) return null;
	return { fen: moves.length > 0 ? moves[0].before : chess.fen(), moves: moves.map(move => move.san) };
}

export { boardFromPgn }
