import { describe, it, expect } from "vitest"
import { mount, unmount, flushSync } from "svelte"

const { default: DeckContents } = await import("./DeckContents.svelte");

const deck = (id, parent_id, position, cards = 1) => ({ id, name: id, parent_id, position, cards });
// A (A1 (A1a), A2) · B
const nested = [
	deck("A", "root", 1), deck("A1", "A", 1), deck("A1a", "A1", 1), deck("A2", "A", 2),
	deck("B", "root", 2)
];

const open = subdecks => {
	const target = document.createElement("div");
	document.body.append(target);
	const app = mount(DeckContents, { target, props: { subdecks } });
	flushSync();
	const items = () => [...target.querySelectorAll("li")];
	const item = name => items().find(li => li.querySelector(".name").textContent.trim() === name);
	const click = el => { el.click(); flushSync(); };
	return {
		shown: () => items().map(li => li.querySelector(".name").textContent.trim()),
		sign: name => item(name).querySelector(".expander"),
		toggleAll: () => target.querySelector(".toggle-all"),
		click,
		close: () => { unmount(app); target.remove(); }
	};
}

describe("Deck contents", () => {
	it("starts with the top decks only, and opens and folds a deck by its sign", () => {
		const page = open(nested);
		expect(page.shown()).toEqual(["A", "B"]);
		expect(page.sign("B").classList.contains("empty")).toBe(true);

		page.click(page.sign("A"));
		expect(page.shown()).toEqual(["A", "A1", "A2", "B"]);
		expect(page.sign("A").getAttribute("aria-expanded")).toBe("true");

		page.click(page.sign("A1"));
		expect(page.shown()).toEqual(["A", "A1", "A1a", "A2", "B"]);

		page.click(page.sign("A"));
		expect(page.shown()).toEqual(["A", "B"]);
		page.close();
	})

	it("expands every deck, then folds them all back to the top", () => {
		const page = open(nested);
		expect(page.toggleAll().textContent).toBe("Expand all");

		page.click(page.toggleAll());
		expect(page.shown()).toEqual(["A", "A1", "A1a", "A2", "B"]);
		expect(page.toggleAll().textContent).toBe("Fold all");

		page.click(page.sign("A1"));
		expect(page.toggleAll().textContent).toBe("Expand all");
		page.click(page.toggleAll());
		expect(page.shown()).toEqual(["A", "A1", "A1a", "A2", "B"]);

		page.click(page.toggleAll());
		expect(page.shown()).toEqual(["A", "B"]);
		expect(page.toggleAll().textContent).toBe("Expand all");
		page.close();
	})

	it("counts every card under a deck, folded or not", () => {
		const page = open(nested);
		const counts = () => [...document.querySelectorAll("li .cards")].map(el => el.textContent);
		expect(counts()).toEqual(["4 cards", "1 card"]);
		page.close();
	})

	it("has no signs and no toggle when no deck holds decks", () => {
		const page = open([deck("A", "root", 1), deck("B", "root", 2)]);
		expect(page.shown()).toEqual(["A", "B"]);
		expect(page.toggleAll()).toBeNull();
		expect(document.querySelector(".expander")).toBeNull();
		page.close();
	})
})
