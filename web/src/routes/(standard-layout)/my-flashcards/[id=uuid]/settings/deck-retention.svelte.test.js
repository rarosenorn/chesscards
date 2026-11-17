import { describe, it, expect, vi, beforeEach } from "vitest"
import { mount, unmount, flushSync } from "svelte"

// A deck's desired retention: its own, or the one above it (the deck above's,
// or the user's own from Settings); and the decks inside made to follow it
const forms = vi.hoisted(() => ({ submits: [] }));
vi.mock("$app/forms", () => ({ enhance: (form, submit) => { forms.submits.push({ form, submit }); return { destroy() {} } } }));
vi.mock("$app/state", () => ({ page: { data: { pageTitle: "Settings" } } }));
vi.mock("$lib/modals.svelte.js", () => ({ typedConfirmModal: async () => false }));
const pool = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn() }));
vi.mock("$lib/server/pool.js", () => ({ pool }));

const { default: Settings } = await import("./+page.svelte");
const decks = await import("$lib/server/decks.js");
const { desiredRetention } = await import("$lib/deck-tree.js");

const deckData = ({ retention, parentRetention, ancestors = [], inside = 0 }) => ({
	deck: {
		id: "d", name: "Deck", inOrder: true, reviewsInOrder: false, tacticLadder: null, parentLadder: [14, 60, 180],
		retention, parentRetention, isMarketplace: false, instanceId: null, ancestors,
		decks: [{ id: "d", ladder: [14, 60, 180] }, ...Array.from({ length: inside }, (_, i) => ({ id: `in${i}`, ladder: [14, 60, 180] }))]
	},
	listing: null, uploadRequest: null, holdsTaken: false
});

const open = data => {
	const target = document.createElement("div");
	document.body.append(target);
	const app = mount(Settings, { target, props: { data, form: null } });
	flushSync();
	const section = [...target.querySelectorAll("section")].find(s => s.querySelector("h3")?.textContent === "Desired retention");
	return {
		pills: () => [...section.querySelectorAll(".pill")].map(p => p.textContent.trim().replace(/\s+/g, " ")),
		chosen: () => section.querySelector(".pill.selected").textContent.trim().replace(/\s+/g, " "),
		button: () => [...section.querySelectorAll("button")].find(b => b.textContent === "Use for all decks inside"),
		close: () => { unmount(app); target.remove() }
	};
}

describe("a deck's desired retention", () => {
	it("on a deck at the top, follows Settings until the deck has its own", () => {
		const view = open(deckData({ retention: null, parentRetention: 0.95, inside: 2 }));
		expect(view.pills()).toEqual(["As in Settings (95%)", "80%", "85%", "90%", "95%", "97%"]);
		expect(view.chosen()).toBe("As in Settings (95%)");
		expect(view.button()).toBeTruthy();
		view.close();
	})

	it("on a deck inside another, shows its own against the one above, with nothing inside to make follow", () => {
		const view = open(deckData({ retention: 0.9, parentRetention: 0.85, ancestors: [{ id: "p", name: "Parent", bought: false }] }));
		expect(view.pills()[0]).toBe("Same as above (85%)");
		expect(view.chosen()).toBe("90%");
		expect(view.button()).toBeFalsy();
		view.close();
	})

	it("is the deck's own, or else the nearest deck above's, or else the user's", () => {
		const byId = new Map([
			["top", { id: "top", parent_id: null, retention: 0.9 }],
			["mid", { id: "mid", parent_id: "top", retention: null }],
			["low", { id: "low", parent_id: "mid", retention: 0.8 }],
			["solo", { id: "solo", parent_id: null, retention: null }]
		].map(([id, deck]) => [id, deck]));
		expect(desiredRetention(byId, "low", 0.95)).toBe(0.8);
		expect(desiredRetention(byId, "mid", 0.95)).toBe(0.9);
		expect(desiredRetention(byId, "solo", 0.95)).toBe(0.95);
	})
})

describe("making the decks inside follow", () => {
	const library = [
		{ id: "top", parent_id: null, bought: false },
		{ id: "mid", parent_id: "top", bought: false },
		{ id: "low", parent_id: "mid", bought: false },
		{ id: "taken", parent_id: "top", bought: true, instance_id: "taken" },
		{ id: "beside", parent_id: null, bought: false }
	];
	let client;
	beforeEach(() => {
		pool.query.mockReset();
		pool.query.mockImplementation(async () => ({ rows: library, rowCount: 1 }));
		client = { query: vi.fn(async sql => sql.trim().startsWith("select") ? { rows: library } : { rows: [], rowCount: 1 }), release: vi.fn() };
		pool.connect.mockReset();
		pool.connect.mockResolvedValue(client);
	});
	const updates = () => client.query.mock.calls.filter(([sql]) => sql.trim().startsWith("update"));

	it("clears the desired retention of every deck inside, marketplace decks too, and not of the deck itself or beside it", async () => {
		expect(await decks.followRetention("u", "top")).toBe(true);
		const [own, taken] = updates();
		expect(own[1]).toEqual(["u", ["mid", "low", "taken"]]);
		expect(taken[1]).toEqual(["u", ["mid", "low", "taken"]]);
	})

	it("from Settings, clears every deck's", async () => {
		expect(await decks.followRetention("u")).toBe(true);
		expect(updates().map(([, params]) => params)).toEqual([["u", null], ["u", null]]);
	})

	it("clears the tactic ladder of the decks of the user's own inside, a marketplace deck's being its author's", async () => {
		expect(await decks.followTacticLadder("u", "top")).toBe(true);
		const update = pool.query.mock.calls.find(([sql]) => sql.startsWith("update decks set tactic_ladder"));
		expect(update[1]).toEqual(["u", ["mid", "low"]]);
	})
})
