import { Chess } from "chess.js"

// Finding the mistakes in a game the way Lichess's server analysis does, and
// turning each into a card.
//
// An eval is { cp } or { mate }, from White's point of view, for one position.

// How likely the side is to win, -1..1 (lila: scalachess WinPercent)
const winningChances = cp => Math.max(-1, Math.min(1, 2 / (1 + Math.exp(-0.00368208 * cp)) - 1))

// Lichess's judgment of the move between two positions (lila: Advice.scala).
// A drop in winning chances of .1 / .2 / .3 for the mover, else the mate
// rules: letting a mate in, or letting one go. Reproduces every judgment in
// fixtures/lichess-judgments.json.
export const judge = (prev, cur, mover) => {
	const sign = mover === "w" ? 1 : -1
	if (prev.cp != null && cur.cp != null) {
		const delta = sign * (winningChances(prev.cp) - winningChances(cur.cp))
		if (delta >= 0.3) return "blunder"
		if (delta >= 0.2) return "mistake"
		if (delta >= 0.1) return "inaccuracy"
	}
	const pov = e => e.mate != null ? { mate: sign * e.mate } : { cp: sign * e.cp }
	const p = pov(prev), c = pov(cur)
	const created = p.cp != null && c.mate != null && c.mate < 0
	const lost = p.mate != null && p.mate > 0 && (c.cp != null || c.mate < 0)
	if (created) return p.cp < -999 ? "inaccuracy" : p.cp < -700 ? "mistake" : "blunder"
	if (lost) return (c.cp ?? 0) > 999 ? "inaccuracy" : (c.cp ?? 0) > 700 ? "mistake" : "blunder"
	return null
}

export const KINDS = ["blunder", "mistake", "inaccuracy"]

// The game as the positions an engine is asked about. `moves` are chess.js's
// verbose moves; fens[i] is the position before moves[i]. A position with no
// legal move (mate, stalemate) is not one to analyse.
export const readGame = pgn => {
	const chess = new Chess()
	chess.loadPgn(pgn)
	const moves = chess.history({ verbose: true })
	if (moves.length === 0) throw new Error("The game has no moves")
	const fens = [moves[0].before, ...moves.map(m => m.after)]
	return { moves, fens, finished: chess.moves().length === 0, headers: chess.getHeaders() }
}

const uciOf = move => move.from + move.to + (move.promotion ?? "")

// an engine line (UCI) as SAN, as far as it plays
const lineSan = (fen, ucis, max) => {
	const chess = new Chess(fen)
	const out = []
	for (const uci of ucis.slice(0, max)) {
		try { out.push(chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })) }
		catch { break }
	}
	return out
}

const LINE_PLIES = 4

// `evals[i]` is the engine on fens[i]: { cp | mate, pv: [uci...] }, or null
// where it was not asked. Like Lichess, a move the engine would have played
// itself is never judged, whatever the numbers did around it.
export const findMistakes = ({ moves, fens }, evals, color, kinds = KINDS) => {
	const found = []
	moves.forEach((move, ply) => {
		if (move.color !== color) return
		const prev = evals[ply], cur = evals[ply + 1]
		if (!prev || !cur || !prev.pv?.length || prev.pv[0] === uciOf(move)) return
		const kind = judge(prev, cur, color)
		if (!kind || !kinds.includes(kind)) return
		// a mate the mover had and let go: the better line is then the whole
		// mate, however long, since the mate is the point
		const mate = prev.mate != null ? (color === "w" ? 1 : -1) * prev.mate : 0
		const missedMate = mate > 0 ? mate : null
		const better = lineSan(fens[ply], prev.pv, missedMate ? 2 * missedMate - 1 : LINE_PLIES)
		if (better.length === 0) return
		found.push({
			ply, kind, move, missedMate,
			better,
			followUp: lineSan(fens[ply + 1], cur.pv ?? [], LINE_PLIES),
			evalBefore: prev.mate != null ? { mate: prev.mate } : { cp: prev.cp },
			evalAfter: cur.mate != null ? { mate: cur.mate } : { cp: cur.cp }
		})
	})
	return found
}

// "27.Qxg5", "10...e4"
const numbered = move => {
	const number = Number(move.before.split(" ")[5])
	return `${number}${move.color === "w" ? "." : "..."}${move.san}`
}

// prose from outside goes into a spec text, where [ ] * and line breaks mean
// things
const plain = text => String(text ?? "").replace(/[\[\]*]/g, "").replace(/\s+/g, " ").trim()

// a reason as the rest of "... because": no "because" of its own, no capital
// to start it (a move's own letter aside), one full stop to end it
const reason = text => {
	const said = plain(text).replace(/^because\s+/i, "").replace(/[.\s]+$/, "")
	// "Black", "White" and a move's own letter keep theirs
	const keeps = /^(Black|White)\b/.test(said) || /^([KQRBN][a-h]?[1-8]?x?[a-h][1-8]|O-O)/.test(said)
	return said && `${keeps ? said : said[0].toLowerCase() + said.slice(1)}.`
}

// The card for one mistake, as a spec for card-spec.js. The board carries the
// game up to and including the move and opens with it already played (the
// board tints the squares of the move it stands on, so it needs no arrow); what follows the move
// is the back of the line, shown when the card is turned, along with a green
// arrow for the better move. That one is a line of the text, written from
// the board move it branches at.
// The back is two bullets, "X was a blunder because ..." and "Y was the best
// move because ...", the second ending in Y's line. `why` is { bad, better },
// the two reasons, or absent. A missed mate needs none: that it was missed is
// the whole reason, and the mate itself the answer.
export const mistakeCardSpec = ({ moves, fens }, mistake, why = null) => {
	const { ply, kind, move, better, followUp, missedMate } = mistake
	const label = numbered(move)
	const a = kind === "inaccuracy" ? "an" : "a"
	const before = ply > 0 ? moves[ply - 1] : null
	const betterLine = [...(before ? [numbered(before)] : []), ...better.map((m, i) => i === 0 && !before ? numbered(m) : m.san)].join(" ")
	return {
		front: {
			text: `Why was ${label} ${a} ${kind}, and what is a better move?`,
			boards: [{
				fen: fens[0],
				moves: [...moves.slice(0, ply + 1).map(m => m.san), ...followUp.map(m => m.san)],
				orientation: move.color,
				openAt: ply + 1,
				...(followUp.length > 0 && { solutionFrom: ply + 1 }),
				solutionArrows: { [ply + 1]: [["success", better[0].from, better[0].to]] }
			}]
		},
		back: [
			`- ${label} was ${a} ${kind}${missedMate ? ` because it misses mate in ${missedMate}.` : reason(why?.bad) ? ` because ${reason(why.bad)}` : "."}`,
			`- ${numbered(better[0])} was the best move${missedMate ? ` because it ${missedMate === 1 ? "is" : "starts the"} mate:` : reason(why?.better) ? ` because ${reason(why.better)}` : ":"} [${betterLine}]`
		].join("\n")
	}
}
