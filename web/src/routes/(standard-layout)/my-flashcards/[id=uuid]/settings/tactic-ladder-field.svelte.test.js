import { describe, it, expect, vi, beforeEach } from "vitest"
import { mount, unmount, tick, flushSync } from "svelte"

// The field shows the ladder the deck's tactic cards climb, its own or the
// deck above's; saving the deck above's keeps the deck following it
const forms = vi.hoisted(() => ({ submits: [] }));
vi.mock("$app/forms", () => ({ enhance: (form, submit) => { forms.submits.push({ form, submit }); return { destroy() {} } } }));
vi.mock("$app/state", () => ({ page: { data: { pageTitle: "Settings" } } }));
vi.mock("$lib/modals.svelte.js", () => ({ typedConfirmModal: async () => false }));
const pool = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("$lib/server/pool.js", () => ({ pool }));

const { default: Settings } = await import("./+page.svelte");
const decks = await import("$lib/server/decks.js");

const deckData = (tacticLadder, parentLadder) => ({
	deck: { id: "d", name: "Deck", inOrder: true, reviewsInOrder: false, tacticLadder, parentLadder, isMarketplace: false, instanceId: null, ancestors: [{ id: "p", name: "Parent", bought: false }], decks: [{ id: "d", ladder: tacticLadder ?? parentLadder }] },
	listing: null, uploadRequest: null, holdsTaken: false
});

const open = data => {
	forms.submits.length = 0;
	const target = document.createElement("div");
	document.body.append(target);
	const props = $state({ data, form: null });
	const app = mount(Settings, { target, props });
	flushSync();
	const field = () => target.querySelector("input[name=ladder]");
	const save = async (typed, then) => {
		field().value = typed;
		const { submit } = forms.submits.find(entry => entry.form.contains(field()));
		const after = submit({ formElement: field().form, formData: new FormData(field().form) });
		await after({ result: { type: "success", data: { ladderSaved: true } }, update: async () => { then?.(props); props.form = { ladderSaved: true } } });
		flushSync();
	}
	return { field, save, close: () => { unmount(app); target.remove() } };
}

describe("the tactic ladder field", () => {
	it("shows the deck above's ladder as text when the deck has none of its own", () => {
		const view = open(deckData(null, [14, 60, 180]));
		expect(view.field().value).toBe("14, 60, 180");
		expect(view.field().placeholder).toBe("");
		view.close();
	});

	it("shows the deck's own ladder when it has one", () => {
		const view = open(deckData([3, 10], [14, 60, 180]));
		expect(view.field().value).toBe("3, 10");
		view.close();
	});

	it("emptied and saved, shows the deck above's again, even when nothing changed on the server", async () => {
		const view = open(deckData(null, [14, 60, 180]));
		await view.save("");
		expect(view.field().value).toBe("14, 60, 180");
		view.close();
	});

	it("saved with its own, shows them as saved", async () => {
		const view = open(deckData(null, [14, 60, 180]));
		await view.save("7 30", props => props.data = deckData([7, 30], [14, 60, 180]));
		expect(view.field().value).toBe("7, 30");
		view.close();
	});
});

describe("saving a tactic ladder", () => {
	const library = [
		{ id: "top", parent_id: null, tactic_ladder: [5, 20] },
		{ id: "mid", parent_id: "top", tactic_ladder: null },
		{ id: "solo", parent_id: null, tactic_ladder: null }
	];
	const stored = () => pool.query.mock.calls.find(([sql]) => sql.startsWith("update decks set tactic_ladder"))[1][2];
	beforeEach(() => {
		pool.query.mockReset();
		pool.query.mockImplementation(async sql => sql.startsWith("update") ? { rowCount: 1 } : { rows: library });
	});

	it("the deck above's ladder is no ladder of its own: the deck keeps following it", async () => {
		await decks.setTacticLadder("u", "mid", [5, 20]);
		expect(stored()).toBeNull();
	});

	it("the default on a deck at the top is none of its own either", async () => {
		await decks.setTacticLadder("u", "solo", [14, 60, 180]);
		expect(stored()).toBeNull();
	});

	it("anything else is the deck's own", async () => {
		await decks.setTacticLadder("u", "mid", [14, 60, 180]);
		expect(stored()).toEqual([14, 60, 180]);
	});

	it("empty is none of its own", async () => {
		await decks.setTacticLadder("u", "mid", null);
		expect(stored()).toBeNull();
	});
});
