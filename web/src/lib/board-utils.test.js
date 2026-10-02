import { describe, it, expect } from "vitest"
import { moveSquares } from "./board-utils.js"

// the squares the board tints for the move just made
describe("moveSquares", () => {
	const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

	it("reads a move's squares off the position it is played in", () => {
		expect(moveSquares(start, "Nf3")).toEqual({ from: "g1", to: "f3" })
		expect(moveSquares("8/4P1k1/8/8/8/8/8/4K2R w K - 0 1", "O-O")).toEqual({ from: "e1", to: "g1" })
	})

	it("reads the ones stored by coordinates, and the ones made off-turn", () => {
		expect(moveSquares(start, "e2-e5")).toEqual({ from: "e2", to: "e5" })
		expect(moveSquares(start, "...Nf6")).toEqual({ from: "g8", to: "f6" })
	})

	it("says nothing for a move that does not play", () => {
		expect(moveSquares(start, "Qh5")).toBe(null)
	})
})
