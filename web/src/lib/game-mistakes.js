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

// an engine line (UCI) as SAN, as far as it plays: `max` moves, and past
// them any captures still coming, since a line cut in the middle of an
// exchange shows one side a piece up that it is not
const lineSan = (fen, ucis, max) => {
	const chess = new Chess(fen)
	const out = []
	for (const uci of ucis) {
		try {
			const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
			if (out.length >= max && !move.captured) break
			out.push(move)
		} catch { break }
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

// a try is kept long enough for its answer to cash in — the reasons are
// written from that — and shown only as far as the answer's point
const TRY_PLIES = 9
const TRY_SHOWN = 4

// a capture, a check, a queen: what a player looks at first
const isTempting = move => (move.captured || /[+#]/.test(move.san)) && (!move.promotion || move.promotion === "q")

// The ways out a line's loser would look for, as { line, at, fen, uci } for
// the engine to try: in the better line the opponent's tempting moves, in
// the played one the player's, at each of their turns, the engine's own move
// aside. `at` counts the line's moves made before the try; the played line
// starts with the mistake itself. A missed mate has nothing to argue.
export const triesToCheck = ({ move, better, followUp, missedMate }) => {
	if (missedMate) return []
	const asks = []
	for (const [line, moves, first] of [["better", better, 1], ["played", [move, ...followUp], 2]])
		for (let at = first; at <= moves.length; at += 2) {
			const own = moves[at] && uciOf(moves[at])
			for (const tried of new Chess(moves[at - 1].after).moves({ verbose: true }))
				if (isTempting(tried) && uciOf(tried) !== own) asks.push({ line, at, fen: tried.before, uci: uciOf(tried) })
		}
	return asks
}

// The mistake with the tries that do fail, each { line, at, moves }: the try
// and the engine's answer to it. `evals[i]` is the engine made to play
// asks[i]. A try it finds about as good as the line's own move is no failed
// way out, only another way, and is left out.
export const withTries = (mistake, asks, evals) => ({
	...mistake,
	tries: asks.flatMap((ask, i) => {
		const found = evals[i]
		if (!found?.pv?.length) return []
		const lineEval = ask.line === "better" ? mistake.evalBefore : mistake.evalAfter
		if (!["mistake", "blunder"].includes(judge(lineEval, found, ask.fen.split(" ")[1]))) return []
		const moves = lineSan(ask.fen, found.pv, TRY_PLIES)
		return moves.length > 1 ? [{ line: ask.line, at: ask.at, moves }] : []
	})
})

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
// move because ...", the second ending in Y's line. `why` is { bad, better,
// tries }, the two reasons and the indexes of the mistake's tries they speak
// of, or absent. Each such try is written after its bullet as a variation in
// parentheses, from the move it answers. A missed mate needs none: that it
// was missed is the whole reason, and the mate itself the answer.
export const mistakeCardSpec = ({ moves, fens }, mistake, why = null) => {
	const { ply, kind, move, better, followUp, missedMate } = mistake
	const label = numbered(move)
	const a = kind === "inaccuracy" ? "an" : "a"
	const before = ply > 0 ? moves[ply - 1] : null
	// moves of the better line, hung off the board move they branch from
	const fromBoard = line => [...(before ? [numbered(before)] : []), ...line.map((m, i) => i === 0 && !before ? numbered(m) : m.san)].join(" ")
	const betterLine = fromBoard(better)
	const played = [move, ...followUp]
	const variations = line => (why?.tries ?? [])
		.map(index => mistake.tries?.[index])
		.filter(tried => tried?.line === line)
		.map(tried => ` ([${line === "better" ? fromBoard(better.slice(0, tried.at)) : numbered(played[tried.at - 1])} | ${tried.moves.slice(0, TRY_SHOWN).map(m => m.san).join(" ")}])`)
		.join("")
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
			`- ${label} was ${a} ${kind}${missedMate ? ` because it misses mate in ${missedMate}.` : reason(why?.bad) ? ` because ${reason(why.bad)}` : "."}${variations("played")}`,
			`- ${numbered(better[0])} was the best move${missedMate ? ` because it ${missedMate === 1 ? "is" : "starts the"} mate:` : reason(why?.better) ? ` because ${reason(why.better)}` : ":"} [${betterLine}]${variations("better")}`
		].join("\n")
	}
}
