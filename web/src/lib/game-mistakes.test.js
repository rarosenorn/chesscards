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

	it("opens one move before it, plays what follows on the back, and writes the better move as a line", () => {
		const [mistake] = findMistakes(game, evals, "w")
		const spec = mistakeCardSpec(game, mistake, { bad: "It drops [a] piece.", better: "Take the *knight*." })
		const board = spec.front.boards[0]
		expect(spec.front.text).toBe("Why was 4.Nxe5 a blunder, and what is a better move?")
		expect(board.moves).toEqual(["e4", "e5", "Nf3", "Nc6", "Bc4", "Nd4", "Nxe5", "Qg5", "Nxf7", "Qxg2"])
		expect([board.openAt, board.solutionFrom, board.orientation]).toEqual([6, 7, "w"])
		expect(board.arrows).toEqual({ 6: [["success", "c6", "d4"]] })
		expect(board.solutionArrows).toEqual({ 6: [["success", "f3", "d4"]] })
		expect(spec.back).toBe("- It drops a piece.\n- [3...Nd4 Nxd4 exd4 c3] Take the knight.")

		const problems = []
		const card = cardBuilder(msg => problems.push(msg)).buildCard(spec, "card")
		expect(problems).toEqual([])
		const marks = JSON.stringify(card.back).match(/"moveRef"/g)
		expect(marks.length).toBe(4)
	})
})
