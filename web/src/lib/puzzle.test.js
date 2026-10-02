import { describe, it, expect } from "vitest"
import { tryMove } from "./puzzle.js"

describe("a move on a puzzle board", () => {
	const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

	it("is right when it is the line's move", () => {
		expect(tryMove(start, "e4", "e2", "e4")).toEqual({ san: "e4", theMove: true })
	})

	it("is wrong when it is another move, or no move at all", () => {
		expect(tryMove(start, "e4", "d2", "d4")).toBe(null)
		expect(tryMove(start, "e4", "e2", "e5")).toBe(null)
	})

	it("is right when it mates, whatever the line has", () => {
		// Qh5 and Qf3 both mate on f7 next; here Black can mate at once two ways
		const fen = "rnb1kbnr/pppp1ppp/8/4p3/5PPq/8/PPPPP2P/RNBQKBNR b KQkq - 0 3"
		const mated = "6k1/5ppp/8/8/8/8/5PPP/R3R1K1 w - - 0 1"
		expect(tryMove(mated, "Ra8+", "e1", "e8")).toEqual({ san: "Re8#", theMove: false })
		expect(tryMove(mated, "Re8#", "e1", "e8")).toEqual({ san: "Re8#", theMove: true })
		expect(tryMove(fen, "Nc6", "h4", "h5")).toBe(null)
	})

	it("promotes to what the line promotes to, and castles as the king's two squares", () => {
		const pawn = "8/4P1k1/8/8/8/8/8/4K2R w K - 0 1"
		expect(tryMove(pawn, "e8=N+", "e7", "e8")).toEqual({ san: "e8=N+", theMove: true })
		expect(tryMove(pawn, "O-O", "e1", "g1")).toEqual({ san: "O-O", theMove: true })
	})
})
