import { describe, it, expect } from "vitest"
import { articleHeadings } from "./articles.js"
import { ttGenerateHTML } from "./tiptap-utility.js"
import { cardBuilder } from "./card-spec.js"

const text = (...nodes) => ({ type: "text", content: { type: "doc", content: nodes } });
const heading = (level, words) => ({ type: "heading", attrs: { level }, content: [{ type: "text", text: words }] });
const paragraph = words => ({ type: "paragraph", content: [{ type: "text", text: words }] });
const page = [text(paragraph("Read this first."))];

describe("an article's headings", () => {
	it("are listed in order with their level, across its text blocks", () => {
		const blocks = [
			text(heading(1, "Checks"), paragraph("A check is..."), heading(2, "Blocking")),
			{ type: "chessboards", content: [] },
			text(heading(1, "Mate threats"))
		];
		expect(articleHeadings(blocks)).toEqual([
			{ level: 1, text: "Checks" },
			{ level: 2, text: "Blocking" },
			{ level: 1, text: "Mate threats" }
		]);
	})

	it("are none for a page without any, or for no page", () => {
		expect(articleHeadings(page)).toEqual([]);
		expect(articleHeadings(null)).toEqual([]);
	})

	it("keep their place when one has no words, and leave out one inside a list", () => {
		const inList = { type: "bulletList", content: [{ type: "listItem", content: [paragraph("a"), heading(1, "Nested")] }] };
		const blocks = [text(heading(1, "One"), { type: "heading", attrs: { level: 1 } }, inList, heading(2, "Three"))];
		expect(articleHeadings(blocks)).toEqual([
			{ level: 1, text: "One" },
			{ level: 1, text: "" },
			{ level: 2, text: "Three" }
		]);
	})

	it("render as the two tags there are, whatever level is stored", () => {
		const html = level => ttGenerateHTML({ type: "doc", content: [heading(level, "T")] });
		expect(html(1)).toBe("<h2>T</h2>");
		expect(html(2)).toBe("<h3>T</h3>");
		// the level names the tag, and stored content is whatever was sent
		for (const level of [7, "1", "x><svg/onload=alert(1)><h", null, { a: 1 }]) expect(html(level)).toBe("<h2>T</h2>");
	})
})

describe("an article written in a deck spec", () => {
	const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
	const build = spec => {
		const problems = [];
		return { blocks: cardBuilder(problem => problems.push(problem)).buildIntro(spec, "intro"), problems };
	}

	it("is text and boards in reading order, with headings", () => {
		const { blocks, problems } = build(["# Title\nFirst line.\n\n## Part", { boards: [{ fen: start, moves: ["e4", "e5"] }] }, "After [1.d4]."]);
		expect(problems).toEqual([]);
		expect(blocks.map(block => block.type)).toEqual(["text", "chessboards", "text"]);
		expect(articleHeadings(blocks)).toEqual([{ level: 1, text: "Title" }, { level: 2, text: "Part" }]);
	})

	it("wires a move to the board above it, or to the one it names", () => {
		const boards = { boards: [{ fen: start, moves: ["e4"] }] };
		const { blocks, problems } = build(["Before [1.d4].", boards, "x", { boards: [{ fen: start, moves: ["c4"] }] }, "After [1.Nf3], and [1.g3](1)."]);
		expect(problems).toEqual([]);
		const named = block => ttGenerateHTML(block.content).match(/data-move-ref="(\d)"/g);
		// none above: the first below
		expect(named(blocks[0])).toEqual(['data-move-ref="1"']);
		expect(named(blocks[4])).toEqual(['data-move-ref="2"', 'data-move-ref="1"']);
	})

	it("says what is wrong with one that is not that", () => {
		expect(build({ text: "x" }).problems).toHaveLength(1);
		expect(build([{ boards: [{ fen: "nope" }] }]).problems).toHaveLength(1);
		expect(build(["[1.Qh5]"]).problems).toHaveLength(1);
		expect(build([""]).problems).toHaveLength(1);
	})
})
