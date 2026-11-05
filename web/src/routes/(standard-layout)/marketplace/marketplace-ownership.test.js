import { describe, it, expect, vi } from "vitest"
import { mount, unmount, tick, createRawSnippet } from "svelte"

vi.mock("$app/state", () => ({ page: { url: new URL("http://localhost/marketplace/d/overview"), form: null, data: {} } }));

const { default: DeckLayout } = await import("./[id=uuid]/+layout@.svelte");

const mpDeck = (price, isAuthor = false, onSale = true, takenDownReason = null) => ({ id: "d", name: "Deck", author: "A", theme: "openings", cardCount: 3, price, isAuthor, onSale, takenDownReason, reviewCount: 0, recommendCount: 0 });

const open = async (ownership, price = "10.00", isAuthor = false, onSale = true, { takenDownReason = null, isAdmin = false } = {}) => {
	const target = document.createElement("div");
	document.body.append(target);
	const children = createRawSnippet(() => ({ render: () => "<div></div>" }));
	const user = isAdmin ? { isAdmin: true } : undefined;
	const app = mount(DeckLayout, { target, props: { data: { mpDeck: mpDeck(price, isAuthor, onSale, takenDownReason), ownership, user }, children } });
	await tick();
	const buttons = [...target.querySelectorAll(".buy-row button")];
	return {
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

	it("the author takes their deck off sale, or puts it back, under the greyed price", async () => {
		const onSale = await open({ owned: true, inLibrary: true }, "10.00", true);
		expect(onSale.buttons).toEqual([["Buy for $10.00", true], ["Take off sale", false]]);
		onSale.close();
		const offSale = await open({ owned: true, inLibrary: false }, "10.00", true, false);
		expect(offSale.buttons).toEqual([["Buy for $10.00", true], ["Get", false], ["Put back on sale", false]]);
		offSale.close();
		const buyer = await open({ owned: true, inLibrary: true });
		expect(buyer.buttons).toEqual([["Buy for $10.00", true]]);
		buyer.close();
	});

	it("taken down: the author sees why and can't put it back; the admin restores it", async () => {
		const author = await open({ owned: true, inLibrary: true }, "10.00", true, true, { takenDownReason: "copied from a book" });
		expect([author.buttons, author.note]).toEqual([[["Buy for $10.00", true]], "Taken down by Chesscards: copied from a book"]);
		author.close();
		const admin = await open({ owned: false, inLibrary: false }, "10.00", false, true, { takenDownReason: "copied from a book", isAdmin: true });
		expect(admin.buttons).toEqual([["Buy for $10.00", false], ["Restore", false]]);
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
