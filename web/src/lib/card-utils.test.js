import { describe, it, expect } from "vitest"
import { firstBoardWithMoves, docPuzzlesWithoutBackBlocks, puzzleWithoutBackMessage, boardForJson } from "./card-utils.js"

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

// A puzzle with no back moves has nothing to play; the card is not saved.
describe("docPuzzlesWithoutBackBlocks", () => {
	const doc = (...boards) => ({ content: [{ type: "paragraph" }, { type: "chessboardBlock", attrs: { boards } }] });
	const board = extra => ({ fen: "8/8/8/8/8/8/8/8 w - - 0 1", moves: ["e4", "e5"], ...extra });

	it("names the puzzle boards with no back, by the numbers the card shows", () => {
		const numbers = docPuzzlesWithoutBackBlocks(doc(
			board({ puzzle: true, solutionFrom: 1 }),
			board({ puzzle: true }),
			board({}),
			board({ puzzle: true, solutionFrom: 2 })
		), 2);
		expect(numbers).toEqual([4, 6]);
		expect(puzzleWithoutBackMessage(numbers)).toBe("Boards 4, 6 are puzzles but have no back moves");
		expect(puzzleWithoutBackMessage([1])).toBe("Board 1 is a puzzle but has no back moves");
	});

	it("keeps the puzzle mark on a board saved without back moves", () => {
		expect(boardForJson({ ...board({ puzzle: true }), annotations: {}, orientation: "w" }).puzzle).toBe(true);
		expect("puzzle" in boardForJson({ ...board({}), annotations: {}, orientation: "w" })).toBe(false);
	});
});
