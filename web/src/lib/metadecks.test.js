import { describe, it, expect } from "vitest"
import { resolveDecks, holders, metadeckOutline } from "./metadecks.js"

const deck = id => ({ kind: "deck", id });
const instance = id => ({ kind: "instance", id });
const meta = id => ({ kind: "metadeck", id });

describe("the decks a metadeck comes to", () => {
	const metadecks = [
		{ id: "endgames", items: [meta("rook"), instance("bought"), deck("basic")] },
		{ id: "rook", items: [deck("lucena"), deck("basic")] },
		{ id: "all", items: [meta("endgames"), meta("rook"), deck("openings")] },
		{ id: "empty", items: [] }
	];
	const ids = id => resolveDecks(metadecks, id).map(item => item.id);

	it("are its own and those of the metadecks inside it, in the order met", () => {
		expect(ids("rook")).toEqual(["lucena", "basic"]);
		expect(ids("endgames")).toEqual(["lucena", "basic", "bought"]);
	})

	it("are each there once, however many ways lead to them", () => {
		expect(ids("all")).toEqual(["lucena", "basic", "bought", "openings"]);
	})

	it("keep their kind", () => {
		expect(resolveDecks(metadecks, "endgames").find(item => item.id === "bought").kind).toBe("instance");
	})

	it("are none for an empty metadeck, or one that is not there", () => {
		expect(ids("empty")).toEqual([]);
		expect(ids("gone")).toEqual([]);
	})

	it("do not run round a loop", () => {
		const looped = [{ id: "a", items: [meta("b"), deck("x")] }, { id: "b", items: [meta("a"), deck("y")] }];
		expect(resolveDecks(looped, "a").map(item => item.id)).toEqual(["y", "x"]);
	})
})

describe("the metadecks that cannot go inside one", () => {
	const metadecks = [
		{ id: "all", items: [meta("endgames")] },
		{ id: "endgames", items: [meta("rook")] },
		{ id: "rook", items: [] },
		{ id: "other", items: [] }
	];

	it("are itself and every metadeck that holds it", () => {
		expect([...holders(metadecks, "rook")].sort()).toEqual(["all", "endgames", "rook"]);
		expect([...holders(metadecks, "all")]).toEqual(["all"]);
		expect([...holders(metadecks, "other")]).toEqual(["other"]);
	})
})

describe("a metadeck's decks as one outline", () => {
	const parts = [
		{ id: "plain", name: "Plain deck", usesSubdecks: false, subdecks: [{ id: "p1", parent_id: null, name: "Subdeck 1", position: 1 }] },
		{ id: "tree", name: "Tree deck", usesSubdecks: true, subdecks: [
			{ id: "t1", parent_id: null, name: "Rook", position: 1 },
			{ id: "t2", parent_id: "t1", name: "Lucena", position: 1 }
		] }
	];
	const outline = metadeckOutline(parts);

	it("puts each deck at the top under its own name, in the metadeck's order", () => {
		expect(outline.filter(node => node.parent_id === null).map(node => [node.name, node.position, node.deckId]))
			.toEqual([["Plain deck", 1, "plain"], ["Tree deck", 2, "tree"]]);
	})

	it("keeps a plain deck's cards directly under its name", () => {
		expect(outline.find(node => node.deckId === "plain").id).toBe("p1");
	})

	it("hangs a deck's subdecks under it as they were", () => {
		expect(outline.find(node => node.id === "t1").parent_id).toBe("tree");
		expect(outline.find(node => node.id === "t2").parent_id).toBe("t1");
		expect(outline.find(node => node.id === "t1").deckId).toBeUndefined();
	})
})
