import { describe, it, expect } from "vitest"
import { introHeadings, isIntroBlocks, introPlaces, pendingIntro } from "./intros.js"
import { ttGenerateHTML } from "./tiptap-utility.js"
import { cardBuilder } from "./card-spec.js"

const text = (...nodes) => ({ type: "text", content: { type: "doc", content: nodes } });
const heading = (level, words) => ({ type: "heading", attrs: { level }, content: [{ type: "text", text: words }] });
const paragraph = words => ({ type: "paragraph", content: [{ type: "text", text: words }] });
const page = [text(paragraph("Read this first."))];

const subdeck = (id, position, parent_id = null, intro = null) => ({ id, name: id, position, parent_id, intro });
const fresh = subdeck_id => ({ subdeck_id, card_type: "basic", state: 0 });
const learning = subdeck_id => ({ subdeck_id, card_type: "basic", state: 1 });

describe("an intro's headings", () => {
	it("are listed in order with their level, across its text blocks", () => {
		const blocks = [
			text(heading(1, "Checks"), paragraph("A check is..."), heading(2, "Blocking")),
			{ type: "chessboards", content: [] },
			text(heading(1, "Mate threats"))
		];
		expect(introHeadings(blocks)).toEqual([
			{ level: 1, text: "Checks" },
			{ level: 2, text: "Blocking" },
			{ level: 1, text: "Mate threats" }
		]);
	})

	it("are none for a page without any, or for no page", () => {
		expect(introHeadings(page)).toEqual([]);
		expect(introHeadings(null)).toEqual([]);
	})

	it("keep their place when one has no words, and leave out one inside a list", () => {
		const inList = { type: "bulletList", content: [{ type: "listItem", content: [paragraph("a"), heading(1, "Nested")] }] };
		const blocks = [text(heading(1, "One"), { type: "heading", attrs: { level: 1 } }, inList, heading(2, "Three"))];
		expect(introHeadings(blocks)).toEqual([
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

describe("what the server takes for an intro", () => {
	const board = { fen: "8/8/8/8/8/8/8/K6k w - - 0 1", moves: ["Ka2"], annotations: {}, orientation: "w" };

	it("is blocks of text and boards", () => {
		expect(isIntroBlocks([])).toBe(true);
		expect(isIntroBlocks(page)).toBe(true);
		expect(isIntroBlocks([text(heading(1, "A"), paragraph("b")), { type: "chessboards", content: [board] }])).toBe(true);
	})

	it("is nothing else", () => {
		expect(isIntroBlocks(null)).toBe(false);
		expect(isIntroBlocks("text")).toBe(false);
		expect(isIntroBlocks([null])).toBe(false);
		expect(isIntroBlocks([{ type: "text" }])).toBe(false);
		expect(isIntroBlocks([{ type: "html", content: "<script>" }])).toBe(false);
		// a node the editor does not have
		expect(isIntroBlocks([text({ type: "iframe", attrs: { src: "x" } })])).toBe(false);
		expect(isIntroBlocks([{ type: "chessboards", content: [{ ...board, fen: "not a position" }] }])).toBe(false);
		expect(isIntroBlocks([{ type: "chessboards", content: [{ ...board, moves: [{}] }] }])).toBe(false);
		expect(isIntroBlocks([{ type: "chessboards", content: "boards" }])).toBe(false);
	})
})

describe("an intro written in a deck spec", () => {
	const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
	const build = spec => {
		const problems = [];
		return { blocks: cardBuilder(problem => problems.push(problem)).buildIntro(spec, "intro"), problems };
	}

	it("is text and boards in reading order, with headings", () => {
		const { blocks, problems } = build(["# Title\nFirst line.\n\n## Part", { boards: [{ fen: start, moves: ["e4", "e5"] }] }, "After [1.d4]."]);
		expect(problems).toEqual([]);
		expect(blocks.map(block => block.type)).toEqual(["text", "chessboards", "text"]);
		expect(introHeadings(blocks)).toEqual([{ level: 1, text: "Title" }, { level: 2, text: "Part" }]);
		expect(isIntroBlocks(blocks)).toBe(true);
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

describe("the intros on the way to a subdeck", () => {
	const deck = {
		id: "deck", name: "Deck", usesSubdecks: true, intro: page,
		subdecks: [subdeck("a", 1, null, page), subdeck("a1", 1, "a"), subdeck("a2", 2, "a", page), subdeck("b", 2)]
	};

	it("are the deck's, then each subdeck's down to it", () => {
		expect(introPlaces(deck, "a2").map(place => place.key)).toEqual(["deck", "a", "a2"]);
		expect(introPlaces(deck, "a1").map(place => place.blocks)).toEqual([page, page, null]);
	})

	it("are the deck's alone when it does not use its subdecks", () => {
		expect(introPlaces({ ...deck, usesSubdecks: false }, "a2").map(place => place.key)).toEqual(["deck"]);
	})

	it("come up outermost first, each until it is passed", () => {
		const cards = [fresh("a1"), fresh("a2"), fresh("b")];
		expect(pendingIntro(deck, cards, "a2", new Set()).key).toBe("deck");
		expect(pendingIntro(deck, cards, "a2", new Set(["deck"])).key).toBe("a");
		expect(pendingIntro(deck, cards, "a2", new Set(["deck", "a"])).key).toBe("a2");
		expect(pendingIntro(deck, cards, "a2", new Set(["deck", "a", "a2"]))).toBe(null);
	})

	it("do not come up for what has been begun", () => {
		// a card of a1 studied: the deck and a are begun, a2 is not
		const cards = [learning("a1"), fresh("a2"), fresh("b")];
		expect(pendingIntro(deck, cards, "a1", new Set())).toBe(null);
		expect(pendingIntro(deck, cards, "a2", new Set()).key).toBe("a2");
	})

	it("skip a place that has no intro, or one with nothing on it", () => {
		expect(pendingIntro({ ...deck, intro: null }, [fresh("b")], "b", new Set())).toBe(null);
		expect(pendingIntro({ ...deck, intro: [] }, [fresh("b")], "b", new Set())).toBe(null);
	})
})
