import { describe, it, expect } from "vitest"
import { unlockedStageIds, firstLockedStage, stageOrder, cardsUnder, gatingDepth } from "./stages.js"

const stage = (id, position, parent_id = null) => ({ id, name: id, position, parent_id });
const fresh = stage_id => ({ stage_id, card_type: "basic", state: 0 });
const learning = stage_id => ({ stage_id, card_type: "basic", state: 1 });
const learned = stage_id => ({ stage_id, card_type: "basic", state: 2 });
const many = (count, make, stage_id) => Array.from({ length: count }, () => make(stage_id));

const open = (stages, cards, depth) => [...unlockedStageIds(stages, cards, depth)].sort();

describe("a flat deck's progression", () => {
	const stages = [stage("a", 1), stage("b", 2), stage("c", 3)];

	it("opens only the first stage while its cards are new", () => {
		expect(open(stages, [fresh("a"), fresh("b"), fresh("c")])).toEqual(["a"]);
	})

	it("opens each next stage once all before it are learned", () => {
		expect(open(stages, [learned("a"), fresh("b"), fresh("c")])).toEqual(["a", "b"]);
		expect(open(stages, [learned("a"), learned("b"), fresh("c")])).toEqual(["a", "b", "c"]);
	})

	it("keeps a later stage shut behind an unlearned one, whatever its own cards", () => {
		expect(open(stages, [fresh("a"), learned("b"), fresh("c")])).toEqual(["a"]);
	})

	it("passes a stage when every card is seen and four in five have graduated", () => {
		const fourOfFive = [...many(4, learned, "a"), learning("a"), fresh("b")];
		expect(open(stages, fourOfFive)).toEqual(["a", "b"]);
		const threeOfFive = [...many(3, learned, "a"), ...many(2, learning, "a"), fresh("b")];
		expect(open(stages, threeOfFive)).toEqual(["a"]);
		const oneUnseen = [...many(9, learned, "a"), fresh("a"), fresh("b")];
		expect(open(stages, oneUnseen)).toEqual(["a"]);
	})

	it("lets an empty stage pass without holding the next one shut", () => {
		expect(open(stages, [fresh("b"), fresh("c")])).toEqual(["a", "b"]);
	})

	it("gates nothing at depth 0", () => {
		expect(open(stages, [fresh("a"), fresh("b"), fresh("c")], 0)).toEqual(["a", "b", "c"]);
	})

	it("reads stages that carry no parent as the top level", () => {
		const legacy = [{ id: "a", name: "a", position: 1 }, { id: "b", name: "b", position: 2 }];
		expect(open(legacy, [fresh("a"), fresh("b")])).toEqual(["a"]);
	})
})

describe("a nested deck's progression", () => {
	// a: a1, a2 · b: b1 · c (a leaf at the top level)
	const stages = [
		stage("b1", 1, "b"), stage("c", 3), stage("a2", 2, "a"),
		stage("a", 1), stage("b", 2), stage("a1", 1, "a")
	];
	const allNew = [fresh("a1"), fresh("a2"), fresh("b1"), fresh("c")];

	it("at depth 1 opens everything inside the first top-level stage at once", () => {
		expect(open(stages, allNew, 1)).toEqual(["a", "a1", "a2"]);
	})

	it("at depth 2 opens the stages inside it in order as well", () => {
		expect(open(stages, allNew, 2)).toEqual(["a", "a1"]);
		expect(open(stages, [learned("a1"), fresh("a2"), fresh("b1"), fresh("c")], 2)).toEqual(["a", "a1", "a2"]);
	})

	it("runs every level deep when no depth is given", () => {
		expect(open(stages, allNew)).toEqual(["a", "a1"]);
	})

	it("opens the next top-level stage only when everything under the one before is learned", () => {
		const halfOfA = [learned("a1"), fresh("a2"), fresh("b1"), fresh("c")];
		expect(open(stages, halfOfA, 1)).toEqual(["a", "a1", "a2"]);
		const allOfA = [learned("a1"), learned("a2"), fresh("b1"), fresh("c")];
		expect(open(stages, allOfA, 1)).toEqual(["a", "a1", "a2", "b", "b1"]);
		expect(open(stages, [learned("a1"), learned("a2"), learned("b1"), fresh("c")], 1))
			.toEqual(["a", "a1", "a2", "b", "b1", "c"]);
	})

	it("counts a stage's four in five over all the cards under it", () => {
		// 8 of 10 under a have graduated, though only 3 of 5 inside a2 have
		const cards = [...many(5, learned, "a1"), ...many(3, learned, "a2"), ...many(2, learning, "a2"), fresh("b1")];
		expect(open(stages, cards, 1)).toEqual(["a", "a1", "a2", "b", "b1"]);
	})

	it("gates nothing at depth 0", () => {
		expect(open(stages, allNew, 0)).toEqual(["a", "a1", "a2", "b", "b1", "c"]);
	})
})

describe("the first locked stage", () => {
	const stages = [stage("a", 1), stage("a1", 1, "a"), stage("a2", 2, "a"), stage("b", 2), stage("b1", 1, "b")];
	const names = found => found && { locked: found.locked.id, before: found.before.id };

	it("is the first shut one in reading order, with the stage holding it shut", () => {
		const allNew = [fresh("a1"), fresh("a2"), fresh("b1")];
		expect(names(firstLockedStage(stages, allNew))).toEqual({ locked: "a2", before: "a1" });
		expect(names(firstLockedStage(stages, allNew, 1))).toEqual({ locked: "b", before: "a" });
	})

	it("moves on as stages are learned", () => {
		const a1Done = [learned("a1"), fresh("a2"), fresh("b1")];
		expect(names(firstLockedStage(stages, a1Done))).toEqual({ locked: "b", before: "a" });
	})

	it("is nothing when nothing is shut", () => {
		expect(firstLockedStage(stages, [learned("a1"), learned("a2"), fresh("b1")])).toBe(null);
		expect(firstLockedStage(stages, [fresh("a1"), fresh("a2"), fresh("b1")], 0)).toBe(null);
	})
})

describe("a deck's reading order", () => {
	const stages = [stage("b", 2), stage("a2", 2, "a"), stage("a", 1), stage("a1", 1, "a"), stage("b1", 1, "b")];

	it("follows each stage with everything inside it", () => {
		const order = stageOrder(stages);
		expect(["b1", "a2", "b", "a1", "a"].sort((x, y) => order.get(x) - order.get(y)))
			.toEqual(["a", "a1", "a2", "b", "b1"]);
	})

	it("gathers the cards of a stage and of everything inside it", () => {
		const cards = [fresh("a1"), fresh("a2"), fresh("a2"), fresh("b1")];
		expect(cardsUnder(stages, cards, "a")).toHaveLength(3);
		expect(cardsUnder(stages, cards, "a2")).toHaveLength(2);
		expect(cardsUnder(stages, cards, "b")).toHaveLength(1);
	})
})

describe("how deep a deck's progression runs", () => {
	it("is nothing when the deck is not split up", () => {
		expect(gatingDepth({ chapters: false, progressionDepth: null })).toBe(0);
		expect(gatingDepth({ chapters: false, progressionDepth: 2 })).toBe(0);
	})

	it("is the deck's own depth, and every level when it names none", () => {
		expect(gatingDepth({ chapters: true, progressionDepth: 0 })).toBe(0);
		expect(gatingDepth({ chapters: true, progressionDepth: 2 })).toBe(2);
		expect(gatingDepth({ chapters: true, progressionDepth: null })).toBe(Infinity);
	})
})
