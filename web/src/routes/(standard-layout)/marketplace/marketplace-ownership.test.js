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
	const buttons = [...target.querySelectorAll(".buy-row button")];
	return {
		buttons: buttons.map(b => [b.textContent.trim(), b.disabled]),
		badge: !!target.querySelector(".buy-row .owned"),
		waiver: target.querySelector(".buy-row input[name=waive-withdrawal]"),
		close: () => { unmount(app); target.remove(); }
	};
};

describe("the marketplace deck's buy button", () => {
	it("not owned: buy (with the required waiver box) or get, no badge", async () => {
		const paid = await open({ owned: false, inLibrary: false });
		expect([paid.buttons, paid.badge]).toEqual([[["Buy for $10.00", false]], false]);
		expect(paid.waiver?.required).toBe(true);
		paid.close();
		const free = await open({ owned: false, inLibrary: false }, "0.00");
		expect([free.buttons, free.badge, free.waiver]).toEqual([[["Get for free", false]], false, null]);
		free.close();
	});

	it("owned and in My flashcards: the price, greyed, beside the badge", async () => {
		const paid = await open({ owned: true, inLibrary: true });
		expect([paid.buttons, paid.badge, paid.waiver]).toEqual([[["Buy for $10.00", true]], true, null]);
		paid.close();
		const free = await open({ owned: true, inLibrary: true }, "0.00");
		expect([free.buttons, free.badge]).toEqual([[["Get for free", true]], true]);
		free.close();
	});

	it("owned, not in My flashcards: Get below the greyed price", async () => {
		const view = await open({ owned: true, inLibrary: false });
		expect([view.buttons, view.badge, view.waiver]).toEqual([[["Buy for $10.00", true], ["Get", false]], true, null]);
		view.close();
	});
});
