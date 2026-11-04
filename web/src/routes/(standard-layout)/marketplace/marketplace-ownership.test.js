import { describe, it, expect, vi } from "vitest"
import { mount, unmount, tick, createRawSnippet } from "svelte"

vi.mock("$app/state", () => ({ page: { url: new URL("http://localhost/marketplace/d/overview"), form: null, data: {} } }));

const { default: DeckLayout } = await import("./[id=uuid]/+layout@.svelte");

const mpDeck = (price, isAuthor = false) => ({ id: "d", name: "Deck", author: "A", theme: "openings", cardCount: 3, price, isAuthor, reviewCount: 0, recommendCount: 0 });

const open = async (ownership, price = "10.00", isAuthor = false) => {
	const target = document.createElement("div");
	document.body.append(target);
	const children = createRawSnippet(() => ({ render: () => "<div></div>" }));
	const app = mount(DeckLayout, { target, props: { data: { mpDeck: mpDeck(price, isAuthor), ownership }, children } });
	await tick();
	const button = target.querySelector(".buy-row button");
	return {
		label: button.textContent.trim(),
		disabled: button.disabled,
		badge: !!target.querySelector(".buy-row .owned"),
		waiver: target.querySelector(".buy-row input[name=waive-withdrawal]"),
		close: () => { unmount(app); target.remove(); }
	};
};

describe("the marketplace deck's buy button", () => {
	it("not owned: buy (with the required waiver box) or get, no badge", async () => {
		const paid = await open({ owned: false, inLibrary: false });
		expect([paid.label, paid.disabled, paid.badge]).toEqual(["Buy for $10.00", false, false]);
		expect(paid.waiver?.required).toBe(true);
		paid.close();
		const free = await open({ owned: false, inLibrary: false }, "0.00");
		expect([free.label, free.disabled, free.badge, free.waiver]).toEqual(["Get for free", false, false, null]);
		free.close();
	});

	it("the author adds their own paid deck free, without the waiver", async () => {
		const view = await open({ owned: false, inLibrary: false }, "10.00", true);
		expect([view.label, view.disabled, view.waiver]).toEqual(["Add to my flashcards", false, null]);
		view.close();
	});

	it("owned and in the library: disabled, with the badge", async () => {
		const view = await open({ owned: true, inLibrary: true });
		expect([view.disabled, view.badge]).toEqual([true, true]);
		view.close();
	});

	it("bought, then deleted from the library: add it back at no charge", async () => {
		const view = await open({ owned: true, inLibrary: false });
		expect([view.label, view.disabled, view.badge, view.waiver]).toEqual(["Add to my flashcards", false, true, null]);
		view.close();
	});
});
