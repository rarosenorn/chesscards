import { describe, it, expect, vi } from "vitest"
import { mount, unmount, tick } from "svelte"

const page = vi.hoisted(() => ({ url: new URL("http://localhost/marketplace/deck"), form: null, data: {} }));
vi.mock("$app/state", () => ({ page }));
vi.mock("$app/forms", () => ({ deserialize: JSON.parse }));
vi.mock("$app/navigation", () => ({ invalidateAll: async () => {}, goto: async () => {} }));

const { default: DeckPage } = await import("./[slug]/+page@.svelte");

let form = null;

const mpDeck = (price, isAuthor = false, onSale = true, takenDownReason = null) => ({ id: "d", slug: "deck", name: "Deck", description: [], author: "A", theme: "openings", cardCount: 3, price, isAuthor, onSale, takenDownReason, reviewCount: 0, recommendCount: 0 });

const open = async (ownership, price = "10.00", isAuthor = false, onSale = true, { takenDownReason = null, isAdmin = false } = {}) => {
	const target = document.createElement("div");
	document.body.append(target);
	const user = isAdmin ? { isAdmin: true } : undefined;
	const data = { mpDeck: mpDeck(price, isAuthor, onSale, takenDownReason), ownership, user, contents: [], reviews: [], previewCards: [{ id: "c1", front: [], back: [], card_type: "basic" }], isAdmin };
	const app = mount(DeckPage, { target, props: { data, form } });
	await tick();
	const buttons = [...target.querySelectorAll(".buy-row button")];
	return {
		target,
		buttons: buttons.map(b => [b.textContent.trim(), b.disabled]),
		badge: !!target.querySelector(".buy-row .owned"),
		guarantee: !!target.querySelector(".buy-row .guarantee"),
		note: target.querySelector(".buy-row .taken-down")?.textContent.trim() ?? null,
		reason: target.querySelector(".buy-row input[name=reason]"),
		close: () => { unmount(app); target.remove(); }
	};
};

describe("the marketplace deck's buy button", () => {
	it("not owned: buy (with the guarantee) or get, no badge", async () => {
		const paid = await open({ owned: false, inLibrary: false });
		expect([paid.buttons, paid.badge]).toEqual([[["Buy for $10.00", false]], false]);
		expect(paid.guarantee).toBe(true);
		paid.close();
		const free = await open({ owned: false, inLibrary: false }, "0.00");
		expect([free.buttons, free.badge, free.guarantee]).toEqual([[["Get for free", false]], false, false]);
		free.close();
	});

	it("owned and in My flashcards: the price, greyed, beside the badge", async () => {
		const paid = await open({ owned: true, inLibrary: true });
		expect([paid.buttons, paid.badge, paid.guarantee]).toEqual([[["Buy for $10.00", true]], true, false]);
		paid.close();
		const free = await open({ owned: true, inLibrary: true }, "0.00");
		expect([free.buttons, free.badge]).toEqual([[["Get for free", true]], true]);
		free.close();
	});

	it("owned, not in My flashcards: Get below the greyed price", async () => {
		const view = await open({ owned: true, inLibrary: false });
		expect([view.buttons, view.badge, view.guarantee]).toEqual([[["Buy for $10.00", true], ["Get", false]], true, false]);
		view.close();
	});

	it("the author sees what anyone who has the deck sees: no way to run it from here", async () => {
		const onSale = await open({ owned: true, inLibrary: true }, "10.00", true);
		expect([onSale.buttons, onSale.badge]).toEqual([[["Buy for $10.00", true]], true]);
		onSale.close();
		const offSale = await open({ owned: true, inLibrary: false }, "10.00", true, false);
		expect(offSale.buttons).toEqual([["Buy for $10.00", true], ["Get", false]]);
		offSale.close();
	});

	it("taken down: the admin sees why and restores it; the author's page says why, not this one", async () => {
		const admin = await open({ owned: false, inLibrary: false }, "10.00", false, true, { takenDownReason: "copied from a book", isAdmin: true });
		expect([admin.buttons, admin.note]).toEqual([[["Buy for $10.00", false], ["Restore", false]], "Taken down by Chesscards: copied from a book"]);
		admin.close();
	});

	it("an admin can take a deck down, with a reason", async () => {
		const admin = await open({ owned: false, inLibrary: false }, "10.00", false, true, { isAdmin: true });
		expect([admin.buttons.at(-1), admin.reason?.required]).toEqual([["Take down", false], true]);
		admin.close();
		const buyer = await open({ owned: false, inLibrary: false });
		expect(buyer.reason).toBe(null);
		buyer.close();
	});
});

describe("the marketplace deck page's tabs", () => {
	const tab = (target, text) => [...target.querySelectorAll(".tabs button")].find(b => b.textContent.trim() === text);

	it("opens on Overview; Sample cards swaps in the sample cards on the same page", async () => {
		const view = await open({ owned: false, inLibrary: false });
		expect([tab(view.target, "Overview").classList.contains("active"), view.target.querySelectorAll(".tabs a").length]).toEqual([true, 0]);
		expect(view.target.querySelector(".no-preview")).toBe(null);
		tab(view.target, "Sample cards").click();
		await tick();
		expect(tab(view.target, "Sample cards").classList.contains("active")).toBe(true);
		expect(view.target.querySelectorAll(".tabs button.active").length).toBe(1);
		tab(view.target, "Overview").click();
		await tick();
		expect(tab(view.target, "Overview").classList.contains("active")).toBe(true);
		view.close();
	});

	it("?view=sample-cards opens on Sample cards", async () => {
		page.url = new URL("http://localhost/marketplace/deck?view=sample-cards");
		const view = await open({ owned: false, inLibrary: false });
		expect(tab(view.target, "Sample cards").classList.contains("active")).toBe(true);
		view.close();
		page.url = new URL("http://localhost/marketplace/deck");
	});

	it("the buy and admin forms post to the deck's page", async () => {
		const view = await open({ owned: false, inLibrary: false }, "10.00", false, true, { isAdmin: true });
		expect([...view.target.querySelectorAll(".buy-row form")].map(f => f.getAttribute("action")))
			.toEqual(["/marketplace/deck?/getDeck", "/marketplace/deck?/takeDown"]);
		view.close();
	});
});
