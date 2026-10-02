import { Chess } from "chess.js"

// A move made on a puzzle board, against the move the line has there.
// Lichess's rule: it is right if it is the line's move, or if it mates —
// a mate the line does not have is a win all the same. A promotion is taken
// to be to the piece the line promotes to (a queen where the line has none).
// Returns null for a drop that is no legal move at all — a slip of the hand,
// not an answer — else the move as chess.js made it, whether it is right,
// and whether it is the line's own.
export const tryMove = (fen, wantedSan, from, to) => {
	let wanted = null, made = null;
	try { wanted = new Chess(fen).move(wantedSan); } catch { /* a move chess.js cannot make is matched by nothing */ }
	try { made = new Chess(fen).move({ from, to, promotion: wanted?.promotion ?? "q" }); } catch { /* not a legal move */ }
	if (!made) return null;
	const theMove = !!wanted && made.from === wanted.from && made.to === wanted.to;
	return { san: made.san, theMove, right: theMove || made.san.endsWith("#") };
}
