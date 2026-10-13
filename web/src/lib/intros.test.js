import { describe, it, expect } from "vitest"
import { introHeadings, introPlaces, pendingIntro } from "./intros.js"

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

	it("skip a place that has no intro", () => {
		expect(pendingIntro({ ...deck, intro: null }, [fresh("b")], "b", new Set())).toBe(null);
	})
})
