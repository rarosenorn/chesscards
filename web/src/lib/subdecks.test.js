import { describe, it, expect } from "vitest"
import { unlockedSubdeckIds, firstLockedSubdeck, subdeckPath, subdeckTrail, subdeckLevels, deckListing, subdeckOutline, subdeckOrder, leafSubdecks, subdeckSubtree, cardsUnder, gatingDepth } from "./subdecks.js"

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

describe("a subdeck studied on its own", () => {
	// a: a1 (a1x, a1y), a2 · b: b1
	const subdecks = [
		subdeck("a", 1), subdeck("a1", 1, "a"), subdeck("a1x", 1, "a1"), subdeck("a1y", 2, "a1"), subdeck("a2", 2, "a"),
		subdeck("b", 2), subdeck("b1", 1, "b")
	];
	const allNew = [fresh("a1x"), fresh("a1y"), fresh("a2"), fresh("b1")];

	it("is open though the deck would hold it shut", () => {
		expect(open(subdecks, allNew, Infinity)).toEqual(["a", "a1", "a1x"]);
		expect([...unlockedSubdeckIds(subdecks, allNew, Infinity, "b")].sort()).toEqual(["b", "b1"]);
		expect([...unlockedSubdeckIds(subdecks, allNew, Infinity, "a2")]).toEqual(["a2"]);
	})

	it("opens nothing outside itself", () => {
		expect([...unlockedSubdeckIds(subdecks, allNew, 0, "a1")].sort()).toEqual(["a1", "a1x", "a1y"]);
	})

	it("keeps progression among the subdecks inside it, at the levels they sit at", () => {
		// a's subdecks are level 2, a1's are level 3
		expect([...unlockedSubdeckIds(subdecks, allNew, 1, "a")].sort()).toEqual(["a", "a1", "a1x", "a1y", "a2"]);
		expect([...unlockedSubdeckIds(subdecks, allNew, 2, "a")].sort()).toEqual(["a", "a1", "a1x", "a1y"]);
		expect([...unlockedSubdeckIds(subdecks, allNew, Infinity, "a")].sort()).toEqual(["a", "a1", "a1x"]);
	})

	it("names the first shut subdeck inside it only", () => {
		const found = firstLockedSubdeck(subdecks, allNew, Infinity, "a1");
		expect([found.locked.id, found.before.id]).toEqual(["a1y", "a1x"]);
		expect(firstLockedSubdeck(subdecks, allNew, Infinity, "b")).toBe(null);
	})
})

describe("the My flashcards list's numbers", () => {
	// a: a1, a2 · b
	const subdecks = [subdeck("a", 1), subdeck("a1", 1, "a"), subdeck("a2", 2, "a"), subdeck("b", 2)];
	// each subdeck's own counts: a1 is learned bar one review due, a2 and b are all new
	const stats = new Map([
		["a1", { total: 4, seen: 4, graduated: 4, new: 0, learn: 0, review: 1 }],
		["a2", { total: 3, seen: 1, graduated: 0, new: 2, learn: 1, review: 0 }],
		["b", { total: 5, seen: 0, graduated: 0, new: 5, learn: 0, review: 0 }]
	]);
	const deck = progressionDepth => ({ subdecks, usesSubdecks: true, progressionDepth });
	const row = (listing, id) => listing.subdecks.find(entry => entry.id === id);

	it("counts for the deck every card in it, in a locked subdeck as in an open one", () => {
		expect(deckListing(deck(null), stats)).toMatchObject({ new: 7, learn: 1, review: 1 });
		expect(deckListing(deck(0), stats)).toMatchObject({ new: 7, learn: 1, review: 1 });
	})

	it("lists the subdecks as an outline, saying which the deck has locked", () => {
		const listing = deckListing(deck(null), stats);
		expect(listing.subdecks.map(entry => [entry.name, entry.level, entry.locked])).toEqual([
			["a", 1, false], ["a1", 2, false], ["a2", 2, false], ["b", 1, true]
		]);
		expect(listing.subdecks.filter(entry => entry.holdsSubdecks).map(entry => entry.name)).toEqual(["a"]);
	})

	it("counts for a subdeck every card under it, locked or not", () => {
		const listing = deckListing(deck(null), stats);
		expect(row(listing, "a")).toMatchObject({ new: 2, learn: 1, review: 1 });
		expect(row(listing, "a1")).toMatchObject({ new: 0, learn: 0, review: 1 });
		expect(row(listing, "b")).toMatchObject({ new: 5, learn: 0, review: 0, locked: true });
	})

	it("counts for a subdeck the ones it holds shut inside it, so a row is the sum of those under it", () => {
		// a1 not begun: a2 is shut behind it, and b behind a
		const unbegun = new Map([
			["a1", { total: 4, seen: 0, graduated: 0, new: 4, learn: 0, review: 0 }],
			["a2", { total: 3, seen: 0, graduated: 0, new: 3, learn: 0, review: 0 }],
			["b", { total: 5, seen: 0, graduated: 0, new: 5, learn: 0, review: 0 }]
		]);
		const listing = deckListing(deck(null), unbegun);
		expect(row(listing, "a2")).toMatchObject({ new: 3, locked: true });
		expect(row(listing, "a")).toMatchObject({ new: 7, locked: false });
		expect(listing).toMatchObject({ new: 12 });
	})

	it("lists no subdecks for a deck that uses none, and gates nothing", () => {
		const plain = deckListing({ subdecks: [subdeck("only", 1)], usesSubdecks: false, progressionDepth: null },
			new Map([["only", { total: 2, seen: 0, graduated: 0, new: 2, learn: 0, review: 0 }]]));
		expect(plain).toEqual({ new: 2, learn: 0, review: 0, subdecks: [] });
	})
})

describe("a subdeck's place in words", () => {
	const subdecks = [subdeck("a", 1), subdeck("a1", 1, "a"), subdeck("a1x", 1, "a1"), subdeck("b", 2)];

	it("is the names down to it", () => {
		expect(subdeckPath(subdecks, "a1x")).toBe("a › a1 › a1x");
		expect(subdeckPath(subdecks, "b")).toBe("b");
		expect(subdeckTrail(subdecks, "a1x")).toEqual(["a", "a1", "a1x"]);
	})

	it("counts the deck's levels of subdecks", () => {
		expect(subdeckLevels(subdecks)).toBe(3);
		expect(subdeckLevels([subdeck("only", 1)])).toBe(1);
		expect(subdeckLevels([])).toBe(0);
	})
})

describe("a deck's reading order", () => {
	const subdecks = [subdeck("b", 2), subdeck("a2", 2, "a"), subdeck("a", 1), subdeck("a1", 1, "a"), subdeck("b1", 1, "b")];

	it("follows each subdeck with everything inside it", () => {
		const order = subdeckOrder(subdecks);
		expect(["b1", "a2", "b", "a1", "a"].sort((x, y) => order.get(x) - order.get(y)))
			.toEqual(["a", "a1", "a2", "b", "b1"]);
	})

	it("is an outline with each subdeck's depth, number and whether it holds cards", () => {
		expect(subdeckOutline(subdecks).map(({ subdeck, level, number, leaf }) => [subdeck.id, level, number, leaf])).toEqual([
			["a", 1, "1", false], ["a1", 2, "1.1", true], ["a2", 2, "1.2", true],
			["b", 1, "2", false], ["b1", 2, "2.1", true]
		]);
	})

	it("runs every level backwards when descending, each subdeck still ahead of its own", () => {
		expect(subdeckOutline(subdecks, true).map(({ subdeck, number }) => [subdeck.id, number])).toEqual([
			["b", "2"], ["b1", "2.1"], ["a", "1"], ["a2", "1.2"], ["a1", "1.1"]
		]);
	})

	it("numbers by place among siblings, not by the stored position", () => {
		const gapped = [subdeck("x", 3), subdeck("y", 7), subdeck("y1", 4, "y")];
		expect(subdeckOutline(gapped).map(entry => entry.number)).toEqual(["1", "2", "2.1"]);
	})

	it("names the subdecks that hold the cards, in order", () => {
		expect(leafSubdecks(subdecks).map(leaf => leaf.id)).toEqual(["a1", "a2", "b1"]);
		expect(leafSubdecks([subdeck("only", 1)]).map(leaf => leaf.id)).toEqual(["only"]);
	})

	it("gathers a subdeck with everything inside it", () => {
		expect([...subdeckSubtree(subdecks, "a")].sort()).toEqual(["a", "a1", "a2"]);
		expect([...subdeckSubtree(subdecks, "b1")]).toEqual(["b1"]);
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
