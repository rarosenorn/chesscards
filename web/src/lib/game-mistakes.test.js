import { describe, it, expect } from "vitest"
import { judge, readGame, findMistakes, mistakeCardSpec } from "./game-mistakes.js"
import { cardBuilder } from "./card-spec.js"
import games from "./fixtures/lichess-judgments.json"

// Real games with Lichess's own evals and judgments (its API's `analysis`):
// given the same numbers, the rule has to say what Lichess said.
describe("judge", () => {
	const evalOf = raw => typeof raw === "string" ? { mate: Number(raw.slice(1)) } : raw == null ? null : { cp: raw }

	it("reproduces every Lichess judgment in the fixture", () => {
		let checked = 0
		for (const game of games) {
			let prev = { cp: 15 }
			game.moves.forEach(([raw, theirs], i) => {
				const cur = evalOf(raw)
				if (prev && cur && theirs) {
					expect(judge(prev, cur, i % 2 === 0 ? "w" : "b"), `${game.id} ply ${i + 1}`).toBe(theirs.toLowerCase())
					checked += 1
				}
				prev = cur
			})
		}
		expect(checked).toBeGreaterThan(150)
	})

	it("judges from the mover's side", () => {
		expect(judge({ cp: 0 }, { cp: -400 }, "w")).toBe("blunder")
		expect(judge({ cp: 0 }, { cp: -400 }, "b")).toBe(null)
		expect(judge({ cp: 0 }, { cp: 400 }, "b")).toBe("blunder")
	})

	it("calls a mate let in, and a mate let go", () => {
		expect(judge({ cp: 50 }, { mate: -3 }, "w")).toBe("blunder")
		expect(judge({ cp: -1200 }, { mate: -3 }, "w")).toBe("inaccuracy")
		expect(judge({ mate: 2 }, { cp: 300 }, "w")).toBe("blunder")
		expect(judge({ mate: 2 }, { cp: 1500 }, "w")).toBe("inaccuracy")
		expect(judge({ mate: 2 }, { mate: 4 }, "w")).toBe(null)
	})
})

describe("a mistake's card", () => {
	const pgn = "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3#"
	const game = readGame(pgn)
	// the engine, as far as this test needs it: White was fine until 4.Nxe5
	const evals = game.fens.map((_, i) => ({ cp: i <= 6 ? 30 : -400, pv: [] }))
	evals[6] = { cp: 30, pv: ["f3d4", "e5d4", "c2c3"] }
	evals[7] = { cp: -400, pv: ["d8g5", "e5f7", "g5g2"] }

	it("is found only for the side asked about, and never for the engine's own move", () => {
		const found = findMistakes(game, evals, "w")
		expect(found.map(m => [m.ply, m.kind, m.move.san])).toEqual([[6, "blunder", "Nxe5"]])
		expect(findMistakes(game, evals, "b")).toEqual([])
		const same = evals.map((e, i) => i === 6 ? { ...e, pv: ["f3e5"] } : e)
		expect(findMistakes(game, same, "w")).toEqual([])
		expect(findMistakes(game, evals, "w", ["inaccuracy"])).toEqual([])
	})

	it("opens with it played and arrowed, plays what follows on the back, and writes the better move as a line", () => {
		const [mistake] = findMistakes(game, evals, "w")
		const spec = mistakeCardSpec(game, mistake, { bad: "It drops [a] piece.", better: "Take the *knight*." })
		const board = spec.front.boards[0]
		expect(spec.front.text).toBe("Why was 4.Nxe5 a blunder, and what is a better move?")
		expect(board.moves).toEqual(["e4", "e5", "Nf3", "Nc6", "Bc4", "Nd4", "Nxe5", "Qg5", "Nxf7", "Qxg2"])
		expect([board.openAt, board.solutionFrom, board.orientation]).toEqual([7, 7, "w"])
		expect(board.arrows).toEqual({ 7: [["warning", "f3", "e5"]] })
		expect(board.solutionArrows).toEqual({ 7: [["success", "f3", "d4"]] })
		expect(spec.back).toBe("- It drops a piece.\n- [3...Nd4 Nxd4 exd4 c3] Take the knight.")

		const problems = []
		const card = cardBuilder(msg => problems.push(msg)).buildCard(spec, "card")
		expect(problems).toEqual([])
		const marks = JSON.stringify(card.back).match(/"moveRef"/g)
		expect(marks.length).toBe(4)
	})
})

describe("the edges of a game", () => {
	const built = spec => {
		const problems = []
		cardBuilder(msg => problems.push(msg)).buildCard(spec, "card")
		return problems
	}

	it("makes a card of the very first move, which has no move before it", () => {
		const game = readGame("1. f3 e5 2. g4 Qh4#")
		const evals = game.fens.map(() => ({ cp: 0, pv: [] }))
		evals[0] = { cp: 30, pv: ["e2e4", "e7e5"] }
		evals[1] = { cp: -150, pv: ["e7e5", "g2g4"] }
		const [mistake] = findMistakes(game, evals, "w")
		const spec = mistakeCardSpec(game, mistake)
		expect(spec.front.boards[0].arrows).toEqual({ 1: [["warning", "f2", "f3"]] })
		expect(spec.back).toBe("- 1.f3\n- [1.e4 e5]")
		expect(built(spec)).toEqual([])
	})

	it("does not judge the mating move, and judges the move that let mate in", () => {
		const game = readGame("1. f3 e5 2. g4 Qh4#")
		expect(game.finished).toBe(true)
		const evals = [{ cp: 30, pv: ["e2e4"] }, { cp: -150, pv: ["e7e5"] }, { cp: -150, pv: ["d2d4", "e5d4"] }, { mate: -1, pv: ["d8h4"] }, null]
		expect(findMistakes(game, evals, "b")).toEqual([])
		const [mate] = findMistakes(game, evals, "w").filter(m => m.move.san === "g4")
		expect(mate.kind).toBe("blunder")
		const spec = mistakeCardSpec(game, mate)
		expect(spec.front.boards[0].moves).toEqual(["f3", "e5", "g4", "Qh4#"])
		expect(built(spec)).toEqual([])
	})

	it("takes a game that starts from a set-up position, Black to move", () => {
		const game = readGame('[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4q3/R3K3 b Q - 0 30"]\n\n30... Qb5 31. Kd2 Qd5+')
		const evals = [{ cp: -900, pv: ["e2a6", "e1d2"] }, { cp: 0, pv: ["e1d2"] }, { cp: 0, pv: ["b5d5"] }, { cp: 0, pv: [] }]
		const [mistake] = findMistakes(game, evals, "b")
		const spec = mistakeCardSpec(game, mistake)
		expect(spec.front.text).toBe("Why was 30...Qb5 a blunder, and what is a better move?")
		expect(spec.back).toBe("- 30...Qb5\n- [30...Qa6 Kd2]")
		expect(built(spec)).toEqual([])
	})

	it("knows a promotion and a castle as the engine writes them", () => {
		const game = readGame('[SetUp "1"]\n[FEN "8/4P1k1/8/8/8/8/8/4K2R w K - 0 1"]\n\n1. e8=Q Kf6 2. O-O+')
		const evals = [{ cp: 900, pv: ["e7e8q"] }, { cp: 100, pv: ["g7f6"] }, { cp: 900, pv: ["e1g1"] }, { cp: 100, pv: [] }]
		expect(findMistakes(game, evals, "w")).toEqual([])
	})

	it("leaves a move alone when the engine had nothing to say about it", () => {
		const game = readGame("1. e4 e5 2. Nf3")
		expect(findMistakes(game, [{ cp: 0, pv: ["d2d4"] }, null, { cp: -900, pv: [] }, null], "w")).toEqual([])
	})

	it("says a missed mate was missed, and writes the whole mate out", () => {
		// Black to move has mate in 2 (1...Qh4+ 2.g3 ... is not it; the fool's mate one move deep is)
		const game = readGame("1. f3 e5 2. g4 Nc6")
		const evals = [{ cp: 30, pv: ["e2e4"] }, { cp: -150, pv: ["e7e5"] }, { cp: -150, pv: ["d2d4"] }, { mate: -1, pv: ["d8h4"] }, { cp: -300, pv: ["d2d4", "d7d5"] }]
		const [mistake] = findMistakes(game, evals, "b")
		expect([mistake.kind, mistake.missedMate, mistake.better.map(m => m.san)]).toEqual(["blunder", 1, ["Qh4#"]])
		const spec = mistakeCardSpec(game, mistake, { bad: "ignored", better: "ignored" })
		expect(spec.back).toBe("- 2...Nc6 is a blunder because it misses mate in 1.\n- [2.g4 Qh4#]")
		expect(built(spec)).toEqual([])
	})

	it("writes a long mate in full, and no further", () => {
		// the lines only need to be legal here: a "mate in 3" is five plies
		const game = readGame("1. a3 a6")
		const evals = [{ mate: 3, pv: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6"] }, { cp: 500, pv: ["a7a6"] }, { cp: 500, pv: [] }]
		const [mistake] = findMistakes(game, evals, "w")
		expect(mistake.missedMate).toBe(3)
		expect(mistake.better.map(m => m.san)).toEqual(["e4", "e5", "Nf3", "Nc6", "Bc4"])
	})
})
