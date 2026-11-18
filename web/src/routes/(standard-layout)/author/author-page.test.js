import { describe, it, expect, vi, beforeEach } from "vitest"
import { mount, unmount, tick } from "svelte"

vi.mock("$app/forms", () => ({ enhance: () => {} }));
const marketplace = vi.hoisted(() => ({
	getAuthorDecks: vi.fn(), getAuthorSales: vi.fn(), setOnSale: vi.fn(),
	requestChanges: vi.fn(), getDeckForChanges: vi.fn(), getChangeRequest: vi.fn(), getDeckCards: vi.fn()
}));
vi.mock("$lib/server/marketplace.js", () => marketplace);
const payouts = vi.hoisted(() => ({ sellsDecks: vi.fn(), getPayoutDetails: vi.fn(), getEarnings: vi.fn(), savePayoutDetails: vi.fn() }));
vi.mock("$lib/server/payouts.js", () => payouts);
vi.mock("$lib/server/fsrs-optimizer.js", () => ({ dayOf: () => ({ timeZone: "UTC" }) }));

const { default: AuthorPage } = await import("./+page.svelte");
const { actions } = await import("./+page.server.js");
const changes = await import("./[id=uuid]/changes/+page.server.js");

const DECK = "11111111-1111-4111-8111-111111111111";
const deck = fields => ({
	id: DECK, slug: "alpha", name: "Alpha", price: "10.00", onSale: true, takenDownReason: null, deckId: "own",
	holders: 3, sales: 4, refunds: 1, earnedCents: 1800, reviewCount: 2, recommendCount: 1, changes: undefined, ...fields
});
const payout = { email: null, name: null, currency: null, pendingEmail: null, owedCents: 0, payouts: [] };

const open = async ({ decks = [], requests = [], sales = [], payouts = null, form = null } = {}) => {
	const target = document.createElement("div");
	document.body.append(target);
	const data = { decks, requests, sales, payouts, timeZone: "UTC", user: { email: "me@example.com" } };
	const app = mount(AuthorPage, { target, props: { data, form } });
	await tick();
	const rows = [...target.querySelectorAll(".deck")];
	return {
		target,
		text: target.textContent.replace(/\s+/g, " "),
		rows: rows.map(row => ({
			text: row.textContent.replace(/\s+/g, " ").trim(),
			actions: [...row.querySelectorAll(".actions button, .actions a")].map(el => el.textContent.trim()),
			links: [...row.querySelectorAll(".actions a")].map(el => el.getAttribute("href"))
		})),
		close: () => { unmount(app); target.remove(); }
	};
};

describe("Your marketplace decks", () => {
	it("nothing on the marketplace: how to put a deck there", async () => {
		const view = await open();
		expect(view.text).toContain("You have no decks on the marketplace");
		expect(view.target.querySelector(".totals")).toBe(null);
		view.close();
	});

	it("a paid deck on sale: its numbers, Take off sale, Request changes, the deck it came from", async () => {
		const view = await open({ decks: [deck()], payouts: payout });
		expect(view.text).toContain("4 sales, 1 refunded · $18.00 earned in all");
		expect(view.rows[0].text).toContain("On sale · $10.00");
		expect(view.rows[0].text).toContain("4 sales, 1 refunded · $18.00 earned · 3 people have it");
		expect(view.rows[0].actions).toEqual(["Take off sale", "Request changes", "Open in My flashcards"]);
		expect(view.rows[0].links).toEqual([`/author/${DECK}/changes`, "/my-flashcards/own/settings"]);
		expect(view.target.querySelector("#payouts")).toBeTruthy();
		view.close();
	});

	it("a refused payout detail is said once, in the payouts", async () => {
		const view = await open({ decks: [deck()], payouts: payout, form: { failed: "payout", errors: ["Choose your bank account's currency"] } });
		expect(view.text.split("Choose your bank account's currency").length - 1).toBe(1);
		expect(view.target.querySelector("#payouts").textContent).toContain("Choose your bank account's currency");
		view.close();
	});

	it("off sale: Put back on sale; a free deck shows no sales, payouts or totals", async () => {
		const view = await open({ decks: [deck({ onSale: false, price: "0.00", holders: 1 })] });
		expect(view.rows[0].actions[0]).toBe("Put back on sale");
		expect(view.rows[0].text).toContain("Off sale · Free");
		expect(view.rows[0].text).toContain("1 person has it");
		expect(view.rows[0].text).not.toContain("sales");
		expect([view.target.querySelector(".totals"), view.target.querySelector(".sales"), view.target.querySelector("#payouts")]).toEqual([null, null, null]);
		view.close();
	});

	it("taken down: why, and no way to put it back on sale", async () => {
		const view = await open({ decks: [deck({ takenDownReason: "copied from a book" })] });
		expect(view.rows[0].text).toContain("Taken down by Chesscards: copied from a book");
		expect(view.rows[0].actions).toEqual(["Request changes", "Open in My flashcards"]);
		view.close();
	});

	it("changes waiting for review, or rejected with the reason", async () => {
		const waiting = await open({ decks: [deck({ changes: { status: "pending", parts: ["name", "thumbnail", "sample cards"] } })] });
		expect(waiting.rows[0].text).toContain("Changes to the name, thumbnail and sample cards are waiting for review.");
		waiting.close();
		const rejected = await open({ decks: [deck({ changes: { status: "rejected", parts: ["description"], rejectionReason: "too short" } })] });
		expect(rejected.rows[0].text).toContain('Changes to the description were rejected: "too short"');
		rejected.close();
	});

	it("upload requests waiting or rejected, leading to the deck's Settings", async () => {
		const view = await open({ requests: [
			{ id: "r1", deckId: "d1", name: "Waiting", price: "5.00", status: "pending" },
			{ id: "r2", deckId: "d2", name: "Turned down", price: "0.00", status: "rejected", rejectionReason: "empty" }
		] });
		expect(view.rows.map(row => row.text)).toEqual([
			"Waiting Upload waiting for review · $5.00 Open in My flashcards",
			'Turned down Upload rejected · Free "empty" Open in My flashcards'
		]);
		expect(view.rows[1].links).toEqual(["/my-flashcards/d2/settings"]);
		view.close();
	});

	it("the latest sales: date, deck, price, the author's share, refunds", async () => {
		const view = await open({ decks: [deck()], sales: [
			{ id: "s1", createdAt: "2026-11-03T10:00:00Z", deckName: "Alpha", slug: "alpha", priceCents: 1000, shareCents: 600, refunded: true },
			{ id: "s2", createdAt: "2026-11-02T10:00:00Z", deckName: "Alpha", slug: "alpha", priceCents: 1000, shareCents: null, refunded: false }
		] });
		const lines = [...view.target.querySelectorAll(".sales li")].map(li => li.textContent.replace(/\s+/g, " ").trim());
		expect(lines).toEqual([
			"Nov 3, 2026 Alpha $10.00 your share $6.00 refunded",
			"Nov 2, 2026 Alpha $10.00 your share is being worked out"
		]);
		view.close();
	});
});

const post = async (action, fields, locals = { userId: "u" }, params = {}) => {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.set(key, value);
	try {
		return await action({ request: new Request("http://localhost/author", { method: "POST", body }), locals, params });
	} catch (thrown) {
		return { status: thrown.status };
	}
};

describe("the author page's actions", () => {
	beforeEach(() => {
		marketplace.setOnSale.mockReset();
		marketplace.requestChanges.mockReset();
	});

	it("on sale: only a deck of the author's own, by a well-formed id", async () => {
		marketplace.setOnSale.mockResolvedValue(true);
		expect(await post(actions.onSale, { deckId: DECK, "on-sale": "false" })).toBe(undefined);
		expect(marketplace.setOnSale).toHaveBeenCalledWith("u", DECK, false);
		expect((await post(actions.onSale, { deckId: "x'; drop", "on-sale": "true" })).status).toBe(404);
		marketplace.setOnSale.mockResolvedValue(false);
		expect((await post(actions.onSale, { deckId: DECK, "on-sale": "true" })).status).toBe(404);
		expect((await post(actions.onSale, { deckId: DECK, "on-sale": "true" }, {})).status).toBe(404);
	});

	const description = JSON.stringify([{ type: "text", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }] } }]);
	const asked = { name: "Alpha Deck", description, previewCardIds: JSON.stringify([DECK]) };
	const request = (fields, locals) => post(changes.actions.requestChanges, fields, locals, { id: DECK });

	it("request changes: what was asked for goes to the request", async () => {
		marketplace.requestChanges.mockResolvedValue(true);
		expect(await request({ ...asked, keepPendingImage: "true" })).toBe(undefined);
		expect(marketplace.requestChanges).toHaveBeenCalledWith("u", DECK, expect.objectContaining({
			name: "Alpha Deck", previewCardIds: [DECK], image: null, keepPendingImage: true
		}));
	});

	it("request changes refuses a bad name, an empty description, bad card ids and a deck not theirs", async () => {
		expect((await request({ ...asked, name: "abc" })).data.errors).toEqual(["Name must be between 4 and 100 characters"]);
		expect((await request({ ...asked, description: "[]" })).data.errors).toEqual(["A description is required"]);
		expect((await request({ ...asked, previewCardIds: '["x"]' })).data.errors).toEqual(["Invalid sample card selection"]);
		expect(marketplace.requestChanges).not.toHaveBeenCalled();
		marketplace.requestChanges.mockRejectedValue(new Error("Nothing is changed"));
		expect((await request(asked)).data.errors).toEqual(["Nothing is changed"]);
		marketplace.requestChanges.mockResolvedValue(false);
		expect((await request(asked)).status).toBe(404);
	});
});
