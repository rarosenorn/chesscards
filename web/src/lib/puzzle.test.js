import { describe, it, expect } from "vitest"
import { tryMove } from "./puzzle.js"

describe("a move on a puzzle board", () => {
	const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

	it("is right when it is the line's move", () => {
		expect(tryMove(start, "e4", "e2", "e4")).toMatchObject({ san: "e4", theMove: true, right: true })
	})

	it("is wrong when it is another move, and nothing at all when it is no legal move", () => {
		expect(tryMove(start, "e4", "d2", "d4")).toMatchObject({ san: "d4", theMove: false, right: false })
		expect(tryMove(start, "e4", "e2", "e5")).toBe(null)
		expect(tryMove(start, "e4", "e2", "e2")).toBe(null)
	})

	it("is right when it mates, whatever the line has", () => {
		// Qh5 and Qf3 both mate on f7 next; here Black can mate at once two ways
		const fen = "rnb1kbnr/pppp1ppp/8/4p3/5PPq/8/PPPPP2P/RNBQKBNR b KQkq - 0 3"
		const mated = "6k1/5ppp/8/8/8/8/5PPP/R3R1K1 w - - 0 1"
		expect(tryMove(mated, "Ra8+", "e1", "e8")).toMatchObject({ san: "Re8#", theMove: false, right: true })
		expect(tryMove(mated, "Re8#", "e1", "e8")).toMatchObject({ san: "Re8#", theMove: true, right: true })
		expect(tryMove(fen, "Nc6", "h4", "h5").right).toBe(false)
	})

	it("promotes to what the line promotes to, and castles as the king's two squares", () => {
		const pawn = "8/4P1k1/8/8/8/8/8/4K2R w K - 0 1"
		expect(tryMove(pawn, "e8=N+", "e7", "e8")).toMatchObject({ san: "e8=N+", theMove: true, right: true })
		expect(tryMove(pawn, "O-O", "e1", "g1")).toMatchObject({ san: "O-O", theMove: true, right: true })
	})

	it("castles when the king is put on its own rook, either side", () => {
		const both = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"
		expect(tryMove(both, "O-O", "e1", "h1")).toMatchObject({ san: "O-O", to: "g1", theMove: true, right: true })
		expect(tryMove(both, "O-O", "e1", "a1")).toMatchObject({ san: "O-O-O", to: "c1", theMove: false, right: false })
		expect(tryMove(both, "O-O", "e1", "h1").after).toBe("r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1")
		const black = "r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1"
		expect(tryMove(black, "O-O-O", "e8", "a8")).toMatchObject({ san: "O-O-O", to: "c8", theMove: true })
	})

	it("does not castle onto a rook when castling is not there to be played", () => {
		const noRights = "r3k2r/8/8/8/8/8/8/R3K2R w kq - 0 1"
		const blocked = "r3k2r/8/8/8/8/8/8/RN2K1NR w KQkq - 0 1"
		const throughCheck = "r3k2r/8/8/8/8/5r2/8/R3K2R w KQ - 0 1"
		expect(tryMove(noRights, "Ke2", "e1", "h1")).toBe(null)
		expect(tryMove(blocked, "Ke2", "e1", "h1")).toBe(null)
		expect(tryMove(blocked, "Ke2", "e1", "a1")).toBe(null)
		expect(tryMove(throughCheck, "Ke2", "e1", "h1")).toBe(null)
		// a rook taking its own rook's place is no move either
		expect(tryMove(noRights, "Ke2", "a1", "h1")).toBe(null)
	})
})
