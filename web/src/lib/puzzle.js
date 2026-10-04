import { Chess } from "chess.js"

// The king put on its own rook castles, as on Lichess: the square the king
// ends on, or `to` itself for every other move. Asked of the side to move.
export const castleSquare = (chess, from, to) => {
	const king = chess.get(from), rook = chess.get(to);
	if (king?.type !== "k" || rook?.type !== "r" || rook.color !== king.color || to[1] !== from[1]) return to;
	const side = to[0] > from[0] ? "k" : "q";
	return chess.moves({ square: from, verbose: true }).find(move => move.flags.includes(side))?.to ?? to;
}

// A move made on a puzzle board, against the move the line has there.
// Lichess's rule: it is right if it is the line's move, or if it mates —
// a mate the line does not have is a win all the same. A promotion is taken
// to be to the piece the line promotes to (a queen where the line has none).
// Returns null for a drop that is no legal move at all — a slip of the hand,
// not an answer — else the move as chess.js made it (its square and the
// position after it too: a king dropped on its rook lands elsewhere), whether
// it is right, and whether it is the line's own.
export const tryMove = (fen, wantedSan, from, to) => {
	let wanted = null, made = null;
	try { wanted = new Chess(fen).move(wantedSan); } catch { /* a move chess.js cannot make is matched by nothing */ }
	try {
		const chess = new Chess(fen);
		made = chess.move({ from, to: castleSquare(chess, from, to), promotion: wanted?.promotion ?? "q" });
	} catch { /* not a legal move */ }
	if (!made) return null;
	const theMove = !!wanted && made.from === wanted.from && made.to === wanted.to;
	return { san: made.san, to: made.to, after: made.after, theMove, right: theMove || made.san.endsWith("#") };
}
