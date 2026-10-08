import { describe, it, expect } from "vitest"
import { unlockedSubdeckIds, firstLockedSubdeck, subdeckOrder, cardsUnder, gatingDepth } from "./subdecks.js"

const subdeck = (id, position, parent_id = null) => ({ id, name: id, position, parent_id });
const fresh = subdeck_id => ({ subdeck_id, card_type: "basic", state: 0 });
const learning = subdeck_id => ({ subdeck_id, card_type: "basic", state: 1 });
const learned = subdeck_id => ({ subdeck_id, card_type: "basic", state: 2 });
const many = (count, make, subdeck_id) => Array.from({ length: count }, () => make(subdeck_id));

const open = (subdecks, cards, depth) => [...unlockedSubdeckIds(subdecks, cards, depth)].sort();

describe("a flat deck's progression", () => {
	const subdecks = [subdeck("a", 1), subdeck("b", 2), subdeck("c", 3)];

	it("opens only the first subdeck while its cards are new", () => {
		expect(open(subdecks, [fresh("a"), fresh("b"), fresh("c")])).toEqual(["a"]);
	})

	it("opens each next subdeck once all before it are learned", () => {
		expect(open(subdecks, [learned("a"), fresh("b"), fresh("c")])).toEqual(["a", "b"]);
		expect(open(subdecks, [learned("a"), learned("b"), fresh("c")])).toEqual(["a", "b", "c"]);
	})

	it("keeps a later subdeck shut behind an unlearned one, whatever its own cards", () => {
		expect(open(subdecks, [fresh("a"), learned("b"), fresh("c")])).toEqual(["a"]);
	})

	it("passes a subdeck when every card is seen and four in five have graduated", () => {
		const fourOfFive = [...many(4, learned, "a"), learning("a"), fresh("b")];
		expect(open(subdecks, fourOfFive)).toEqual(["a", "b"]);
		const threeOfFive = [...many(3, learned, "a"), ...many(2, learning, "a"), fresh("b")];
		expect(open(subdecks, threeOfFive)).toEqual(["a"]);
		const oneUnseen = [...many(9, learned, "a"), fresh("a"), fresh("b")];
		expect(open(subdecks, oneUnseen)).toEqual(["a"]);
	})

	it("lets an empty subdeck pass without holding the next one shut", () => {
		expect(open(subdecks, [fresh("b"), fresh("c")])).toEqual(["a", "b"]);
	})

	it("gates nothing at depth 0", () => {
		expect(open(subdecks, [fresh("a"), fresh("b"), fresh("c")], 0)).toEqual(["a", "b", "c"]);
	})

	it("reads subdecks that carry no parent as the top level", () => {
		const legacy = [{ id: "a", name: "a", position: 1 }, { id: "b", name: "b", position: 2 }];
		expect(open(legacy, [fresh("a"), fresh("b")])).toEqual(["a"]);
	})
})

describe("a nested deck's progression", () => {
	// a: a1, a2 · b: b1 · c (a leaf at the top level)
	const subdecks = [
		subdeck("b1", 1, "b"), subdeck("c", 3), subdeck("a2", 2, "a"),
		subdeck("a", 1), subdeck("b", 2), subdeck("a1", 1, "a")
	];
	const allNew = [fresh("a1"), fresh("a2"), fresh("b1"), fresh("c")];

	it("at depth 1 opens everything inside the first top-level subdeck at once", () => {
		expect(open(subdecks, allNew, 1)).toEqual(["a", "a1", "a2"]);
	})

	it("at depth 2 opens the subdecks inside it in order as well", () => {
		expect(open(subdecks, allNew, 2)).toEqual(["a", "a1"]);
		expect(open(subdecks, [learned("a1"), fresh("a2"), fresh("b1"), fresh("c")], 2)).toEqual(["a", "a1", "a2"]);
	})

	it("runs every level deep when no depth is given", () => {
		expect(open(subdecks, allNew)).toEqual(["a", "a1"]);
	})

	it("opens the next top-level subdeck only when everything under the one before is learned", () => {
		const halfOfA = [learned("a1"), fresh("a2"), fresh("b1"), fresh("c")];
		expect(open(subdecks, halfOfA, 1)).toEqual(["a", "a1", "a2"]);
		const allOfA = [learned("a1"), learned("a2"), fresh("b1"), fresh("c")];
		expect(open(subdecks, allOfA, 1)).toEqual(["a", "a1", "a2", "b", "b1"]);
		expect(open(subdecks, [learned("a1"), learned("a2"), learned("b1"), fresh("c")], 1))
			.toEqual(["a", "a1", "a2", "b", "b1", "c"]);
	})

	it("counts a subdeck's four in five over all the cards under it", () => {
		// 8 of 10 under a have graduated, though only 3 of 5 inside a2 have
		const cards = [...many(5, learned, "a1"), ...many(3, learned, "a2"), ...many(2, learning, "a2"), fresh("b1")];
		expect(open(subdecks, cards, 1)).toEqual(["a", "a1", "a2", "b", "b1"]);
	})

	it("gates nothing at depth 0", () => {
		expect(open(subdecks, allNew, 0)).toEqual(["a", "a1", "a2", "b", "b1", "c"]);
	})
})

describe("the first locked subdeck", () => {
	const subdecks = [subdeck("a", 1), subdeck("a1", 1, "a"), subdeck("a2", 2, "a"), subdeck("b", 2), subdeck("b1", 1, "b")];
	const names = found => found && { locked: found.locked.id, before: found.before.id };

	it("is the first shut one in reading order, with the subdeck holding it shut", () => {
		const allNew = [fresh("a1"), fresh("a2"), fresh("b1")];
		expect(names(firstLockedSubdeck(subdecks, allNew))).toEqual({ locked: "a2", before: "a1" });
		expect(names(firstLockedSubdeck(subdecks, allNew, 1))).toEqual({ locked: "b", before: "a" });
	})

	it("moves on as subdecks are learned", () => {
		const a1Done = [learned("a1"), fresh("a2"), fresh("b1")];
		expect(names(firstLockedSubdeck(subdecks, a1Done))).toEqual({ locked: "b", before: "a" });
	})

	it("is nothing when nothing is shut", () => {
		expect(firstLockedSubdeck(subdecks, [learned("a1"), learned("a2"), fresh("b1")])).toBe(null);
		expect(firstLockedSubdeck(subdecks, [fresh("a1"), fresh("a2"), fresh("b1")], 0)).toBe(null);
	})
})

describe("a deck's reading order", () => {
	const subdecks = [subdeck("b", 2), subdeck("a2", 2, "a"), subdeck("a", 1), subdeck("a1", 1, "a"), subdeck("b1", 1, "b")];

	it("follows each subdeck with everything inside it", () => {
		const order = subdeckOrder(subdecks);
		expect(["b1", "a2", "b", "a1", "a"].sort((x, y) => order.get(x) - order.get(y)))
			.toEqual(["a", "a1", "a2", "b", "b1"]);
	})

	it("gathers the cards of a subdeck and of everything inside it", () => {
		const cards = [fresh("a1"), fresh("a2"), fresh("a2"), fresh("b1")];
		expect(cardsUnder(subdecks, cards, "a")).toHaveLength(3);
		expect(cardsUnder(subdecks, cards, "a2")).toHaveLength(2);
		expect(cardsUnder(subdecks, cards, "b")).toHaveLength(1);
	})
})

describe("how deep a deck's progression runs", () => {
	it("is nothing when the deck is not split up", () => {
		expect(gatingDepth({ usesSubdecks: false, progressionDepth: null })).toBe(0);
		expect(gatingDepth({ usesSubdecks: false, progressionDepth: 2 })).toBe(0);
	})

	it("is the deck's own depth, and every level when it names none", () => {
		expect(gatingDepth({ usesSubdecks: true, progressionDepth: 0 })).toBe(0);
		expect(gatingDepth({ usesSubdecks: true, progressionDepth: 2 })).toBe(2);
		expect(gatingDepth({ usesSubdecks: true, progressionDepth: null })).toBe(Infinity);
	})
})
