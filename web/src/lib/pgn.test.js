import { describe, it, expect } from "vitest"
import { boardFromPgn } from "./pgn.js"

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("a PGN pasted for a board", () => {
	it("starts from the usual position and keeps the main line", () => {
		const pgn = `[Event "Live Chess"]
[White "me"]
[Black "you"]
[Result "1-0"]

1. e4 {[%clk 0:02:59]} e5 {[%clk 0:02:58]} 2. Nf3 (2. f4 exf4) Nc6 $1
3. Bb5!? a6 1-0`;
		expect(boardFromPgn(pgn)).toEqual({ fen: START, moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"] });
	})

	it("starts from the FEN tag of a game set up from a position", () => {
		const pgn = '[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4q3/R3K3 b Q - 0 30"]\n\n30... Qb5 31. Kd2 Qd5+';
		expect(boardFromPgn(pgn)).toEqual({ fen: "4k3/8/8/8/8/8/4q3/R3K3 b Q - 0 30", moves: ["Qb5", "Kd2", "Qd5+"] });
	})

	it("takes a position with no moves from its FEN tag", () => {
		expect(boardFromPgn('[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/8/4K3 w - - 0 1"]\n\n*')).toEqual({ fen: "4k3/8/8/8/8/8/8/4K3 w - - 0 1", moves: [] });
	})

	it("takes bare moves, line breaks and all", () => {
		expect(boardFromPgn("1. d4 d5\n2. c4")).toEqual({ fen: START, moves: ["d4", "d5", "c4"] });
	})

	it("takes the first game of several, whatever their clock comments", () => {
		const pgn = '[Event "Chapter 1"]\n[Site "?"]\n\n1. e4 {a long comment\n[%clk 0:02:59]} e5 *\n\n[Event "Chapter 2"]\n[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/8/4K3 w - - 0 1"]\n\n1. Kd2 *';
		expect(boardFromPgn(pgn)).toEqual({ fen: START, moves: ["e4", "e5"] });
		expect(boardFromPgn('[Event "a"]\r\n\r\n1. d4 *\r\n\r\n[Event "b"]\r\n\r\n1. e4 *')).toEqual({ fen: START, moves: ["d4"] });
	})

	it("takes Windows line breaks, castling written with zeros, and a promotion", () => {
		expect(boardFromPgn("1. e4 e5\r\n2. Nf3 Nc6\r\n3. Bc4 Nf6\r\n4. 0-0").moves).toEqual(["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "O-O"]);
		expect(boardFromPgn('[SetUp "1"]\n[FEN "8/4P1k1/8/8/8/8/8/4K2R w K - 0 1"]\n\n1. e8=Q Kf6 2. O-O+').moves).toEqual(["e8=Q", "Kf6", "O-O+"]);
	})

	it("leaves a FEN, a broken FEN, an illegal move and plain text alone", () => {
		expect(boardFromPgn(START)).toBeNull();
		expect(boardFromPgn("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq")).toBeNull();
		expect(boardFromPgn("1. e5")).toBeNull();
		expect(boardFromPgn("hello")).toBeNull();
		expect(boardFromPgn("   ")).toBeNull();
		expect(boardFromPgn('[Event "x"]\n\n*')).toBeNull();
		expect(boardFromPgn("1... e5 2. Nf3")).toBeNull();
		expect(boardFromPgn("Here is my game: 1. e4 e5")).toBeNull();
	})
})
