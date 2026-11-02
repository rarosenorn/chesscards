import { describe, it, expect } from "vitest"
import { DEFAULT_TACTIC_LADDER, tacticLadder, unlockedDeckIds, firstLockedDeck, newCardRanks, deckListing, deckOutline, readingOrder, byReadingOrder, deckTrail, deckPath, deckSubtree, cardsUnder, deckChoices } from "./deck-tree.js"

const deck = (id, position, parent_id = null, in_order = true) => ({ id, name: id, position, parent_id, in_order });
const mixed = (id, position, parent_id = null) => deck(id, position, parent_id, false);
let nextId = 0;
const card = (deck_id, state, position = ++nextId) => ({ id: `card${++nextId}`, deck_id, card_type: "basic", state, position });
const fresh = (deck_id, position) => card(deck_id, 0, position);
const learning = deck_id => card(deck_id, 1);
const learned = deck_id => card(deck_id, 2);
const many = (count, make, deck_id) => Array.from({ length: count }, () => make(deck_id));

const open = (decks, cards, rootId) => [...unlockedDeckIds(decks, cards, rootId)].sort();

describe("decks in order", () => {
	const decks = [deck("top", 1), deck("a", 1, "top"), deck("b", 2, "top"), deck("c", 3, "top")];

	it("opens only the first deck inside while its cards are new", () => {
		expect(open(decks, [fresh("a"), fresh("b"), fresh("c")])).toEqual(["a", "top"]);
	})

	it("opens each next deck once all before it are learned", () => {
		expect(open(decks, [learned("a"), fresh("b"), fresh("c")])).toEqual(["a", "b", "top"]);
		expect(open(decks, [learned("a"), learned("b"), fresh("c")])).toEqual(["a", "b", "c", "top"]);
	})

	it("keeps a later deck shut behind an unlearned one, whatever its own cards", () => {
		expect(open(decks, [fresh("a"), learned("b"), fresh("c")])).toEqual(["a", "top"]);
	})

	it("passes a deck when every card is seen and four in five have graduated", () => {
		expect(open(decks, [...many(4, learned, "a"), learning("a"), fresh("b")])).toEqual(["a", "b", "top"]);
		expect(open(decks, [...many(3, learned, "a"), ...many(2, learning, "a"), fresh("b")])).toEqual(["a", "top"]);
		expect(open(decks, [...many(9, learned, "a"), fresh("a"), fresh("b")])).toEqual(["a", "top"]);
	})

	it("lets an empty deck pass without holding the next one shut", () => {
		expect(open(decks, [fresh("b"), fresh("c")])).toEqual(["a", "b", "top"]);
	})

	it("counts the deck's own cards as the first, ahead of the decks inside it", () => {
		expect(open(decks, [fresh("top"), fresh("a")])).toEqual(["top"]);
		expect(open(decks, [learned("top"), fresh("a"), fresh("b")])).toEqual(["a", "top"]);
	})

	it("counts a deck's four in five over all the cards under it", () => {
		// 8 of 10 under a have graduated, though only 3 of 5 inside a2 have
		const nested = [...decks, deck("a1", 1, "a"), deck("a2", 2, "a")];
		const cards = [...many(5, learned, "a1"), ...many(3, learned, "a2"), ...many(2, learning, "a2"), fresh("b")];
		expect(open(nested, cards)).toEqual(["a", "a1", "a2", "b", "top"]);
	})
})

describe("mixed decks", () => {
	it("open every deck inside at once", () => {
		const decks = [mixed("top", 1), deck("a", 1, "top"), deck("b", 2, "top")];
		expect(open(decks, [fresh("a"), fresh("b")])).toEqual(["a", "b", "top"]);
	})

	it("leave each deck inside its own order", () => {
		// a course in order inside a mixed grouping keeps its order
		const decks = [mixed("top", 1), deck("course", 1, "top"), deck("c1", 1, "course"), deck("c2", 2, "course"), deck("other", 2, "top")];
		expect(open(decks, [fresh("c1"), fresh("c2"), fresh("other")])).toEqual(["c1", "course", "other", "top"]);
	})

	it("inside a deck in order open together once their turn comes", () => {
		const decks = [deck("top", 1), mixed("a", 1, "top"), deck("a1", 1, "a"), deck("a2", 2, "a"), deck("b", 2, "top")];
		expect(open(decks, [fresh("a1"), fresh("a2"), fresh("b")])).toEqual(["a", "a1", "a2", "top"]);
	})
})

describe("the first locked deck", () => {
	const decks = [deck("top", 1), deck("a", 1, "top"), deck("a1", 1, "a"), deck("a2", 2, "a"), deck("b", 2, "top"), deck("b1", 1, "b")];
	const names = found => found && { locked: found.locked.id, before: found.before.id, own: found.own };

	it("is the first shut one in reading order, with the deck holding it shut", () => {
		expect(names(firstLockedDeck(decks, [fresh("a1"), fresh("a2"), fresh("b1")]))).toEqual({ locked: "a2", before: "a1", own: false });
	})

	it("moves on as decks are learned", () => {
		expect(names(firstLockedDeck(decks, [learned("a1"), fresh("a2"), fresh("b1")]))).toEqual({ locked: "b", before: "a", own: false });
	})

	it("is held shut by the cards of the deck it sits in, while those are not learned", () => {
		expect(names(firstLockedDeck(decks, [fresh("top"), fresh("a1")]))).toEqual({ locked: "a", before: "top", own: true });
	})

	it("is nothing when nothing is shut", () => {
		expect(firstLockedDeck(decks, [learned("a1"), learned("a2"), fresh("b1")])).toBe(null);
		expect(firstLockedDeck(decks.map(entry => ({ ...entry, in_order: false })), [fresh("a1"), fresh("b1")])).toBe(null);
	})
})

describe("a deck studied on its own", () => {
	// top: a (a1: a1x, a1y; a2), b (b1)
	const decks = [
		deck("top", 1), deck("a", 1, "top"), deck("a1", 1, "a"), deck("a1x", 1, "a1"), deck("a1y", 2, "a1"), deck("a2", 2, "a"),
		deck("b", 2, "top"), deck("b1", 1, "b")
	];
	const allNew = [fresh("a1x"), fresh("a1y"), fresh("a2"), fresh("b1")];

	it("is open though the deck it sits in would hold it shut", () => {
		expect(open(decks, allNew)).toEqual(["a", "a1", "a1x", "top"]);
		expect(open(decks, allNew, "b")).toEqual(["b", "b1"]);
		expect(open(decks, allNew, "a2")).toEqual(["a2"]);
	})

	it("keeps progression among the decks inside it", () => {
		expect(open(decks, allNew, "a1")).toEqual(["a1", "a1x"]);
		const found = firstLockedDeck(decks, allNew, "a1");
		expect([found.locked.id, found.before.id]).toEqual(["a1y", "a1x"]);
		expect(firstLockedDeck(decks, allNew, "b")).toBe(null);
	})

	it("reads as the top when loaded without the decks around it", () => {
		const alone = decks.filter(entry => ["a", "a1", "a1x", "a1y", "a2"].includes(entry.id));
		expect(open(alone, allNew)).toEqual(["a", "a1", "a1x"]);
	})
})

describe("the order new cards come in", () => {
	const ranked = (decks, cards) => {
		const ranks = newCardRanks(decks, cards);
		return [...cards].sort((x, y) => ranks.get(x.id) - ranks.get(y.id)).map(entry => `${entry.deck_id}${entry.position}`);
	}

	it("in order: the deck's own cards, then each deck inside in turn", () => {
		const decks = [deck("t", 1), deck("b", 2, "t"), deck("a", 1, "t")];
		const cards = [fresh("b", 1), fresh("a", 2), fresh("t", 1), fresh("a", 1), fresh("b", 2)];
		expect(ranked(decks, cards)).toEqual(["t1", "a1", "a2", "b1", "b2"]);
	})

	it("mixed: one from each in turn, each in its own order, its own cards taking a turn as well", () => {
		const decks = [mixed("t", 1), deck("a", 1, "t"), deck("b", 2, "t")];
		const cards = [fresh("a", 1), fresh("a", 2), fresh("a", 3), fresh("b", 1), fresh("b", 2), fresh("t", 1)];
		expect(ranked(decks, cards)).toEqual(["t1", "a1", "b1", "a2", "b2", "a3"]);
	})

	it("mixed around decks in order: each deck inside gives its cards in its own order", () => {
		const decks = [mixed("t", 1), deck("a", 1, "t"), deck("a1", 1, "a"), deck("a2", 2, "a"), deck("b", 2, "t")];
		const cards = [fresh("a2", 1), fresh("a1", 1), fresh("b", 1), fresh("b", 2), fresh("b", 3)];
		expect(ranked(decks, cards)).toEqual(["a11", "b1", "a21", "b2", "b3"]);
	})

	it("ranks a deck's cards alike whether it is studied alone or with the decks around it", () => {
		const decks = [mixed("t", 1), deck("a", 1, "t"), mixed("b", 2, "t"), deck("b1", 1, "b"), deck("b2", 2, "b")];
		const cards = [fresh("a", 1), fresh("b1", 1), fresh("b1", 2), fresh("b2", 1)];
		const inB = ranked(decks, cards).filter(name => name.startsWith("b"));
		expect(ranked(decks.filter(entry => entry.id.startsWith("b")), cards.filter(entry => entry.deck_id.startsWith("b")))).toEqual(inB);
	})
})

describe("the My flashcards list's rows", () => {
	// top: a (a1, a2), b · lone
	const decks = [deck("top", 1), deck("a", 1, "top"), deck("a1", 1, "a"), deck("a2", 2, "a"), deck("b", 2, "top"), deck("lone", 2)];
	const stats = new Map([
		["a1", { total: 4, seen: 4, graduated: 4, new: 0, learn: 0, review: 1 }],
		["a2", { total: 3, seen: 0, graduated: 0, new: 3, learn: 0, review: 0 }],
		["b", { total: 5, seen: 0, graduated: 0, new: 5, learn: 0, review: 0 }],
		["lone", { total: 2, seen: 0, graduated: 0, new: 2, learn: 0, review: 0 }]
	]);
	const rows = deckListing(decks, stats);
	const row = id => rows.find(entry => entry.deck.id === id);

	it("are every deck in reading order with its depth", () => {
		expect(rows.map(entry => [entry.deck.id, entry.level, entry.holdsDecks])).toEqual([
			["top", 0, true], ["a", 1, true], ["a1", 2, false], ["a2", 2, false], ["b", 1, false], ["lone", 0, false]
		]);
	})

	it("count everything under a deck, in a locked deck as in an open one", () => {
		expect(row("top")).toMatchObject({ new: 8, learn: 0, review: 1, total: 12, locked: false });
		expect(row("a")).toMatchObject({ new: 3, review: 1, locked: false });
		expect(row("b")).toMatchObject({ new: 5, locked: true });
		expect(row("lone")).toMatchObject({ new: 2, locked: false });
	})

	it("count a deck with no cards as nothing", () => {
		expect(deckListing([deck("empty", 1)], new Map())[0]).toMatchObject({ new: 0, learn: 0, review: 0, total: 0, locked: false });
	})
})

describe("the outline", () => {
	const decks = [deck("t", 1), deck("b", 2, "t"), deck("a2", 2, "a"), deck("a", 1, "t"), deck("a1", 1, "a"), deck("b1", 1, "b")];

	it("follows each deck with everything inside it, numbered under the top deck", () => {
		expect(deckOutline(decks).map(({ deck: entry, level, number }) => [entry.id, level, number])).toEqual([
			["t", 0, ""], ["a", 1, "1"], ["a1", 2, "1.1"], ["a2", 2, "1.2"], ["b", 1, "2"], ["b1", 2, "2.1"]
		]);
	})

	it("runs every level backwards when descending, each deck still ahead of its own", () => {
		expect(deckOutline(decks, true).map(({ deck: entry, number }) => [entry.id, number])).toEqual([
			["t", ""], ["b", "2"], ["b1", "2.1"], ["a", "1"], ["a2", "1.2"], ["a1", "1.1"]
		]);
	})

	it("numbers by place among siblings, not by the stored position", () => {
		const gapped = [deck("t", 1), deck("x", 3, "t"), deck("y", 7, "t"), deck("y1", 4, "y")];
		expect(deckOutline(gapped).map(entry => entry.number)).toEqual(["", "1", "2", "2.1"]);
	})

	it("puts cards in reading order, a deck's own before those of the decks inside it", () => {
		const cards = [fresh("b1", 1), fresh("t", 2), fresh("a", 1), fresh("t", 1), fresh("a1", 1)];
		const sorted = [...cards].sort(byReadingOrder(readingOrder(decks)));
		expect(sorted.map(entry => `${entry.deck_id}${entry.position}`)).toEqual(["t1", "t2", "a1", "a11", "b11"]);
	})

	it("gathers a deck with everything inside it, and its cards", () => {
		expect([...deckSubtree(decks, "a")].sort()).toEqual(["a", "a1", "a2"]);
		expect([...deckSubtree(decks, "b1")]).toEqual(["b1"]);
		const cards = [fresh("a"), fresh("a1"), fresh("a2"), fresh("b1")];
		expect(cardsUnder(decks, cards, "a")).toHaveLength(3);
		expect(cardsUnder(decks, cards, "t")).toHaveLength(4);
	})

	it("says a deck's place as the names down to it", () => {
		expect(deckPath(decks, "a1")).toBe("t › a › a1");
		expect(deckTrail(decks, "b")).toEqual(["t", "b"]);
	})

	it("offers every deck to put cards in, but none of a bought deck's", () => {
		const withBought = [deck("t", 1), { ...deck("bought", 1, "t"), bought: true }, { ...deck("inside", 1, "bought"), bought: true }];
		expect(deckChoices(withBought).map(choice => [choice.label.trim(), choice.disabled])).toEqual([
			["t", false], ["bought", true], ["inside", true]
		]);
	})
})

describe("a tactic card's ladder", () => {
	const byId = new Map([
		{ id: "top", parent_id: null, tactic_ladder: null },
		{ id: "drills", parent_id: "top", tactic_ladder: [1, 3, 7] },
		{ id: "inner", parent_id: "drills", tactic_ladder: null },
		{ id: "plain", parent_id: "top", tactic_ladder: null }
	].map(deck => [deck.id, deck]));

	it("is the deck's own, or the nearest above, or the default", () => {
		expect(tacticLadder(byId, "drills")).toEqual([1, 3, 7]);
		expect(tacticLadder(byId, "inner")).toEqual([1, 3, 7]);
		expect(tacticLadder(byId, "plain")).toBe(DEFAULT_TACTIC_LADDER);
		expect(tacticLadder(byId, null)).toBe(DEFAULT_TACTIC_LADDER);
	});
});
