import { describe, it, expect } from "vitest"
import { firstBoardWithMoves } from "./card-utils.js"

// Where the arrow keys land on an active card: the first board, counted
// across front then back, that has moves to step through.
describe("firstBoardWithMoves", () => {
	const boards = (...list) => [{ type: "chessboards", content: list }];
	const still = { fen: "8/8/8/8/8/8/8/8 w - - 0 1", moves: [] };
	const line = { fen: "8/8/8/8/8/8/8/8 w - - 0 1", moves: ["e4"] };

	it("skips a moveless first board for the second that steps", () => {
		expect(firstBoardWithMoves(boards(still, line), [])).toBe(1);
	});

	it("takes the first board when it has the moves", () => {
		expect(firstBoardWithMoves(boards(line, still), [])).toBe(0);
	});

	it("crosses to the back when the front cannot step", () => {
		expect(firstBoardWithMoves(boards(still), boards(line))).toBe(1);
	});

	it("is null when no board has moves", () => {
		expect(firstBoardWithMoves(boards(still), boards(still))).toBe(null);
	});

	it("treats legacy FEN strings as moveless but counts them", () => {
		expect(firstBoardWithMoves(boards("8/8/8/8/8/8/8/8 w - - 0 1", line), [])).toBe(1);
	});

	it("handles a card with no boards at all", () => {
		expect(firstBoardWithMoves([{ type: "text", content: {} }], null)).toBe(null);
	});
});
