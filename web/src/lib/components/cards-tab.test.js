import { describe, it, expect, beforeEach, vi } from "vitest"
import { mount, unmount, tick } from "svelte"
import { createEmptyCard } from "ts-fsrs"
import { reactiveProps } from "./move-ref-click.svelte.js"

// The Cards tab mounted outside the app: the server it moves cards with is a
// stand-in that records what it was asked and answers with the deck as given.
const remote = vi.hoisted(() => ({
	moveCards: vi.fn(),
	listDecks: vi.fn(async () => [{ id: "deck", name: "The deck", level: 0 }, { id: "a", name: "First", level: 1 }]),
	copyCards: vi.fn()
}));
vi.mock("$lib/deck.remote.js", () => remote);
vi.mock("$app/state", () => ({ page: { url: new URL("http://localhost/my-flashcards/deck/browse"), params: { id: "deck" } } }));
vi.mock("$lib/cards.remote.js", () => ({
	updateCardContent: vi.fn(async () => {}),
	updateCardType: vi.fn(async () => {}),
	deleteCards: vi.fn(async () => {})
}));

const { default: Cards } = await import("./Cards.svelte");

const text = words => [{ type: "text", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: words }] }] } }];
const card = (id, deck_id, position, extra = {}) => ({
	...createEmptyCard(new Date(Date.now() - 1000)),
	id, deck_id, position, card_type: "basic", finished_at: null, front: text(`Front ${id}`), back: text(`Back ${id}`), ...extra
});
// The deck: two cards of its own, First (one card) holding Inner (one), and a
// marketplace deck taken (one card, read only).
const deckOf = () => ({
	id: "deck", name: "The deck", isMarketplace: false, ancestors: [],
	decks: [
		{ id: "deck", name: "The deck", position: 1, parent_id: null, in_order: false },
		{ id: "a", name: "First", position: 1, parent_id: "deck", in_order: true },
		{ id: "a1", name: "Inner", position: 1, parent_id: "a", in_order: true },
		{ id: "t", name: "Taken", position: 2, parent_id: "deck", in_order: true, bought: true, instance_id: "t" }
	],
	cards: [
		card("x1", "deck", 1), card("x2", "deck", 2), card("y1", "a", 1), card("z1", "a1", 1),
		card("m1", "t", 1, { marketplace_deck_instance_id: "t" })
	]
});

describe("the Cards tab", () => {
	beforeEach(() => {
		globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
		globalThis.AudioContext = class { constructor() { this.state = "running" } createBufferSource() { return { connect() {}, start() {} } } };
		remote.moveCards.mockReset();
	});

	const open = async deck => {
		const target = document.createElement("div");
		document.body.append(target);
		const shared = reactiveProps(deck);
		remote.moveCards.mockImplementation(async () => JSON.parse(JSON.stringify(shared)));
		const app = mount(Cards, { target, context: new Map([["deck", shared], ["cardDrafts", reactiveProps({})]]) });
		await tick();
		return {
			target, deck: shared,
			// each row as [order, front], a header as its name
			rows: () => [...target.querySelectorAll("tbody tr")].map(tr =>
				tr.classList.contains("subdeck-row")
					? `# ${tr.textContent.trim()}`
					: tr.dataset.cardRow ? `${tr.querySelector(".col-order").textContent.trim()} ${tr.children[1].textContent.trim()}` : tr.textContent.trim()),
			row: id => target.querySelector(`tr[data-card-row="${id}"]`),
			close: () => { unmount(app); target.remove(); }
		};
	}

	it("lists the deck's own cards first, then each deck inside under its header, numbered by its place", async () => {
		const view = await open(deckOf());
		expect(view.rows()).toEqual([
			"1 Front x1", "2 Front x2",
			"# First", "1.1 Front y1",
			"# Inner", "1.1.1 Front z1",
			"# Taken", "2.1 Front m1"
		]);
		view.close();
	})

	it("moves a card to the place typed, in whichever deck that names", async () => {
		const view = await open(deckOf());
		const order = view.row("x2").querySelector(".col-order");
		order.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true }));
		window.dispatchEvent(new MouseEvent("mouseup", {}));
		await tick();
		const input = view.row("x2").querySelector(".order-input");
		expect(input.value).toBe("2");
		input.value = "1.1.1";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		await tick();
		expect(remote.moveCards).toHaveBeenCalledWith({ deckId: "deck", cardIds: ["x2"], targetDeckId: "a1", index: 0 });
		view.close();
	})

	it("refuses a typed place in a marketplace deck, or in no deck at all", async () => {
		const view = await open(deckOf());
		for (const typed of ["2.1", "9.1", "1.x"]) {
			const order = view.row("x1").querySelector(".col-order");
			order.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true }));
			window.dispatchEvent(new MouseEvent("mouseup", {}));
			await tick();
			const input = view.row("x1").querySelector(".order-input");
			input.value = typed;
			input.dispatchEvent(new Event("input", { bubbles: true }));
			input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
			await tick();
		}
		expect(remote.moveCards).not.toHaveBeenCalled();
		view.close();
	})

	it("keeps a marketplace deck's cards as they are: no handle, no menu, no type to change", async () => {
		const view = await open(deckOf());
		const taken = view.row("m1");
		expect(taken.querySelector(".grip")).toBeFalsy();
		expect(taken.querySelector("select")).toBeFalsy();
		taken.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		await tick();
		expect(view.target.querySelector(".context-menu")).toBeFalsy();
		// a card of the user's own has all three
		expect(view.row("x1").querySelector(".grip")).toBeTruthy();
		expect(view.row("x1").querySelector("select")).toBeTruthy();
		view.row("x1").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		await tick();
		expect(view.target.querySelector(".context-menu")).toBeTruthy();
		view.close();
	})

	it("sends cards to the end of a deck chosen from the menu's outline", async () => {
		const view = await open(deckOf());
		view.row("x1").dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true }));
		window.dispatchEvent(new MouseEvent("mouseup", {}));
		view.row("x1").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
		await tick();
		await new Promise(resolve => setTimeout(resolve));
		await tick();
		const menu = view.target.querySelector(".context-menu");
		[...menu.querySelectorAll("button")].find(el => el.textContent.trim() === "Move card to deck").click();
		await tick();
		[...menu.querySelectorAll("button.submenu-item")].find(el => el.textContent.trim() === "First").click();
		await tick();
		expect(remote.moveCards).toHaveBeenCalledWith({ deckId: "deck", cardIds: ["x1"], targetDeckId: "a", index: null });
		view.close();
	})

	it("runs backwards with Order descending, the deck's own cards last", async () => {
		const view = await open(deckOf());
		[...view.target.querySelectorAll("thead button")].find(el => el.textContent.trim().startsWith("Order")).click();
		await tick();
		expect(view.rows()).toEqual([
			"# Taken", "2.1 Front m1",
			"# First", "1.1 Front y1",
			"# Inner", "1.1.1 Front z1",
			"2 Front x2", "1 Front x1"
		]);
		view.close();
	})

	it("is a plain list for a deck with nothing inside it", async () => {
		const view = await open({
			...deckOf(),
			decks: [{ id: "deck", name: "The deck", position: 1, parent_id: null, in_order: true }],
			cards: [card("x1", "deck", 1), card("x2", "deck", 2)]
		});
		expect(view.rows()).toEqual(["1 Front x1", "2 Front x2"]);
		view.close();
	})

	it("shows an article as its page, typed Article, with no state", async () => {
		const article = card("p1", "deck", 1, {
			card_type: "article", state: null, stability: null, difficulty: null, reps: null,
			front: text("Front p1"), back: null
		});
		const view = await open({
			...deckOf(),
			decks: [{ id: "deck", name: "The deck", position: 1, parent_id: null, in_order: true }],
			cards: [article, card("x1", "deck", 2)]
		});
		const row = view.row("p1");
		expect(row.querySelector(".type-select").value).toBe("article");
		expect([...row.querySelectorAll(".type-select option")].map(option => option.textContent)).toEqual(["Basic", "Tactic", "Article"]);
		// due as an unseen tactic is, no FSRS state
		expect(row.children[3].textContent.trim()).toBe("New");
		expect(row.children[5].textContent.trim()).toBe("-");
		// the first card is the one previewed: the page, not a card's two sides
		expect(view.target.querySelector(".selected-card-container article.article .body").textContent.trim()).toBe("Front p1");
		expect(view.target.querySelector(".selected-card-container .flashcard.card-surface")).toBe(null);
		view.close();
	})
})
