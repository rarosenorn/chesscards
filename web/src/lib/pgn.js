import { Chess } from "chess.js"
import { isValidFen } from "./isValidFen.js"

// the first game of a PGN holding several (a whole study, an export): it ends
// where a tag line follows its moves
const TAG = /^\s*\[[A-Za-z0-9_]+\s+"/;
const firstGame = text => {
	const lines = text.split(/\r?\n/);
	let moved = false;
	for (const [i, line] of lines.entries()) {
		if (TAG.test(line)) {
			if (moved) return lines.slice(0, i).join("\n");
		} else if (line.trim()) moved = true;
	}
	return text;
}

// A PGN pasted where a FEN goes, as a board: the position it starts from (its
// FEN tag, else the usual start) and its main line in SAN. Comments, clock
// times and variations are left behind, and so are any games after the first.
// Null for a FEN, and for text that is not a PGN with a move or a position in it.
const boardFromPgn = text => {
	if (typeof text !== "string" || !text.trim() || isValidFen(text)) return null;
	const chess = new Chess();
	try {
		chess.loadPgn(firstGame(text));
	} catch {
		return null;
	}
	const moves = chess.history({ verbose: true });
	if (moves.length === 0 && !chess.getHeaders().FEN) return null;
	return { fen: moves.length > 0 ? moves[0].before : chess.fen(), moves: moves.map(move => move.san) };
}

export { boardFromPgn }
