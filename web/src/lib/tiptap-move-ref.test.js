import { describe, it, expect } from "vitest"
import { parseAside, moveRefContent, parseMoveRef } from "./tiptap-move-ref.js"
import { ttGenerateHTML, ttGenerateText } from "./tiptap-utility.js"
import { replayMoves } from "./board-utils.js"
import { docToSideBlocks } from "./card-utils.js"

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const after = moves => replayMoves({ fen: START, moves }).fens.at(-1);

describe("parseAside", () => {
	it("takes moves with or without their numbers", () => {
		const fen = after(["e4", "e5", "Nf3"]);
		expect(parseAside(fen, "3...Nc6 4.Bb5").moves).toEqual(["Nc6", "Bb5"]);
		expect(parseAside(fen, "Nc6 Bb5").moves).toEqual(["Nc6", "Bb5"]);
	});

	it("numbers each move from where the aside branches", () => {
		const fen = after(["e4", "e5", "Nf3"]);
		expect(parseAside(fen, "Nc6 Bb5").infos).toEqual([
			{ san: "Nc6", color: "b", number: 2 },
			{ san: "Bb5", color: "w", number: 3 }
		]);
	});

	it("names the first move that does not play", () => {
		const parsed = parseAside(START, "e4 e5 Qh9");
		expect(parsed.error).toBe("Qh9");
		expect(parsed.moves).toEqual(["e4", "e5"]);
	});

	it("is empty, and not an error, for empty text", () => {
		expect(parseAside(START, "  ")).toEqual({ moves: [], infos: [], error: null });
	});
});

describe("a written aside", () => {
	const parsed = parseAside(after(["e4", "e5", "Nf3"]), "Nc6 Bb5 a6");
	const content = moveRefContent({ board: 2, from: 3, moves: parsed.moves, infos: parsed.infos });

	// "2…Nc6 3.Bb5 a6": only the move that opens the aside carries a number
	// of its own, as a line reads anywhere else
	it("is one clickable token per move, spaced as text", () => {
		expect(content.map(node => node.text)).toEqual(["2…Nc6", " ", "3.Bb5", " ", "a6"]);
	});

	it("carries the same branch on every token, each at its own move", () => {
		const marks = content.filter(node => node.marks).map(node => node.marks[0].attrs);
		expect(marks.map(attrs => attrs.at)).toEqual([1, 2, 3]);
		expect(new Set(marks.map(attrs => `${attrs.board}/${attrs.from}/${attrs.moves}`)))
			.toEqual(new Set(["2/3/Nc6 Bb5 a6"]));
	});

	it("renders on the card as spans a click can read back", () => {
		const html = ttGenerateHTML({ type: "doc", content: [{ type: "paragraph", content }] });
		const doc = new DOMParser().parseFromString(html, "text/html");
		const tokens = [...doc.querySelectorAll("[data-move-ref]")];
		expect(tokens.map(el => el.textContent)).toEqual(["2…Nc6", "3.Bb5", "a6"]);
		expect(parseMoveRef(tokens[1])).toEqual({ board: 2, from: 3, moves: ["Nc6", "Bb5", "a6"], at: 2 });
	});
});

// the marks ride inside the text block's own JSON, so a card carries its
// asides through storage without the stored format knowing about them
describe("a card holding one", () => {
	const parsed = parseAside(after(["e4"]), "c5 Nf3");
	const content = moveRefContent({ board: 1, from: 1, moves: parsed.moves, infos: parsed.infos });
	const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Or " }, ...content] }] };

	it("stores the moves with the text they were written in", () => {
		const [block] = docToSideBlocks(doc);
		expect(block.type).toBe("text");
		const marks = block.content.content[0].content.filter(node => node.marks).map(node => node.marks[0]);
		expect(marks.map(mark => mark.attrs.at)).toEqual([1, 2]);
		expect(marks[0].type).toBe("moveRef");
	});

	it("reads as the sentence it is", () => {
		expect(ttGenerateText(doc)).toBe("Or 1…c5 2.Nf3");
	});
});

// a line written out in the text is half the board's own and half an aside
describe("moves that follow the board's own line", () => {
	const line = ["e4", "e5", "Nf3"];
	const parsed = parseAside(START, "1.e4 e5 2.Nf3 Nc6 3.Bb5");
	const attrs = moveRefContent({ board: 1, from: 0, moves: parsed.moves, infos: parsed.infos, line })
		.filter(node => node.marks).map(node => node.marks[0].attrs);

	it("name a ply of it, so a click steps the line to that move", () => {
		expect(attrs.slice(0, 3)).toEqual([
			{ board: 1, from: 1, moves: "", at: 0 },
			{ board: 1, from: 2, moves: "", at: 0 },
			{ board: 1, from: 3, moves: "", at: 0 }
		]);
	});

	it("and the aside starts where the two part company", () => {
		expect(attrs.slice(3)).toEqual([
			{ board: 1, from: 3, moves: "Nc6 Bb5", at: 1 },
			{ board: 1, from: 3, moves: "Nc6 Bb5", at: 2 }
		]);
	});
});

// prose that talks about a position the answer's own move reaches: the move is
// played, but the sentence does not write it out
describe("an aside with a lead-in", () => {
	const parsed = parseAside(after(["e4", "e5", "Nf3", "Nf6"]), "Nc3 Nc6 d4");
	const content = moveRefContent({
		board: 1, from: 4, moves: parsed.moves, infos: parsed.infos, line: [], hidden: 1
	});

	it("writes only the moves past the lead-in, numbering from the first of them", () => {
		expect(content.map(node => node.text)).toEqual(["3…Nc6", " ", "4.d4"]);
	});

	it("but plays the whole aside, lead-in included", () => {
		expect(content[0].marks[0].attrs).toEqual({ board: 1, from: 4, moves: "Nc3 Nc6 d4", at: 2 });
		expect(content[2].marks[0].attrs.at).toBe(3);
	});
});
