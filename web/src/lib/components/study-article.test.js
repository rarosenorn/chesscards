import { describe, it, expect, beforeEach, vi } from "vitest"
import { mount, unmount, tick } from "svelte"
import { createEmptyCard } from "ts-fsrs"
import { reactiveProps } from "./move-ref-click.svelte.js"

// Study is mounted outside the app: its page, its form helper, its modals and
// the server it reports to are stand-ins
vi.mock("$app/state", () => ({ page: { url: new URL("http://localhost/my-flashcards/deck/study"), params: {} } }));
vi.mock("$app/forms", () => ({ enhance: () => ({}) }));
vi.mock("$lib/cards.remote.js", () => ({
	updateCardStudyStateAndAddLog: vi.fn(async () => {}),
	markArticleRead: vi.fn(async () => {}),
	logPractice: vi.fn(async () => {}),
	completeCramSession: vi.fn(async () => 1),
	updateCardContent: vi.fn(async () => {}),
	updateCardType: vi.fn(async () => {}),
	deleteCards: vi.fn(async () => {})
}));
vi.mock("$lib/modals.svelte.js", () => ({
	confirmModal: vi.fn(async () => true),
	modalState: { current: null },
	settleModal: () => {}
}));

const { default: Study } = await import("./Study.svelte");
const { markArticleRead } = await import("$lib/cards.remote.js");

// An article stands in the queue where it sits among the new cards: it comes
// up as a page, Continue reads it for good, and it is neither counted nor
// crammed.

const text = words => [{ type: "text", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: words }] }] } }];
const card = (id, deck_id, position = 1) => ({
	...createEmptyCard(new Date(Date.now() - 1000)),
	id, deck_id, position, card_type: "basic", finished_at: null,
	front: text(`Question ${id}`), back: text(`Answer ${id}`)
});
const article = (id, deck_id, { read = false, position = 1, ...rest } = {}) => ({
	id, deck_id, position, card_type: "article",
	due: new Date(Date.now() - 1000).toISOString(),
	stability: null, difficulty: null, elapsed_days: null, scheduled_days: null,
	reps: null, lapses: null, learning_steps: null, state: null,
	last_review: read ? new Date(Date.now() - 864e5).toISOString() : null,
	finished_at: read ? new Date(Date.now() - 864e5).toISOString() : null,
	front: text(`Page ${id}`), back: null, ...rest
});
// a deck as the layout loads it: itself first among its decks (mixed, so
// both decks inside are open), then the two inside it
const deckOf = (cards, { ancestors = [] } = {}) => ({
	id: "deck", name: "The deck", inOrder: false, ancestors,
	decks: [
		{ id: "deck", name: "The deck", position: 1, parent_id: null, in_order: false },
		{ id: "a", name: "First", position: 1, parent_id: "deck", in_order: true },
		{ id: "b", name: "Second", position: 2, parent_id: "deck", in_order: true }
	],
	cards
});

describe("an article in study", () => {
	beforeEach(() => {
		vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, length: 0, key: () => null });
		// jsdom has neither: a page's text blocks watch their own size, and
		// the first key pressed wakes the app's sounds
		globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
		globalThis.AudioContext = class { constructor() { this.state = "running" } createBufferSource() { return { connect() {}, start() {} } } };
		window.scrollTo = () => {};
		markArticleRead.mockClear();
	});

	const study = async deck => {
		const target = document.createElement("div");
		document.body.append(target);
		const app = mount(Study, {
			target,
			context: new Map([["deck", reactiveProps(deck)], ["studyState", reactiveProps({ turnedCardId: null, cram: null })]])
		});
		await tick();
		const button = label => [...target.querySelectorAll("button")].find(el => el.textContent.trim() === label);
		return {
			target,
			button,
			title: () => target.querySelector("article.article h1")?.textContent ?? null,
			trail: () => [...target.querySelectorAll("article.article .trail span:not([aria-hidden])")].map(el => el.textContent),
			body: () => target.querySelector("article.article .body")?.textContent.trim() ?? null,
			question: () => target.querySelector(".flashcard.card-surface .text-block")?.textContent.trim() ?? null,
			newCount: () => target.querySelector(".deck-counts .count.new")?.textContent.trim() ?? null,
			cramCount: () => target.querySelector(".deck-counts.cram")?.textContent.trim() ?? null,
			press: async label => { button(label).click(); await tick(); await tick(); },
			key: async key => { document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); await tick(); await tick(); },
			close: () => { unmount(app); target.remove(); }
		};
	}

	it("comes up where it sits, as a page under the names of its decks, and Continue reads it", async () => {
		const deck = deckOf([card("x", "deck"), article("intro-a", "a"), card("one", "a", 2)], { ancestors: [{ id: "top", name: "Top" }] });
		const page = await study(deck);
		// the deck's own card comes first, then the first deck's turn
		expect(page.question()).toBe("Question x");
		await page.key(" ");
		await page.key("3");

		expect(page.title()).toBe("First");
		expect(page.trail()).toEqual(["Top", "The deck"]);
		expect(page.body()).toBe("Page intro-a");
		expect(page.question()).toBe(null);
		// the page takes no card keys: Space shows nothing, 3 grades nothing
		await page.key(" ");
		await page.key("3");
		expect(page.title()).toBe("First");

		await page.press("Continue");
		expect(markArticleRead).toHaveBeenCalledWith({ cardId: "intro-a", instance: false });
		expect(page.title()).toBe(null);
		expect(page.question()).toBe("Question one");
		// read for this visit too: with the cards graded, it does not come back
		await page.key(" ");
		await page.key("3");
		expect(page.title()).toBe(null);
		page.close();
	})

	it("is read with Enter too", async () => {
		const page = await study(deckOf([article("intro", "deck"), card("one", "deck", 2)]));
		expect(page.title()).toBe("The deck");
		// at the top there are no decks around it to name
		expect(page.trail()).toEqual([]);
		await page.key("Enter");
		expect(markArticleRead).toHaveBeenCalledTimes(1);
		expect(page.question()).toBe("Question one");
		page.close();
	})

	it("does not come up once read", async () => {
		const page = await study(deckOf([article("intro", "deck", { read: true }), card("one", "deck", 2)]));
		expect(page.title()).toBe(null);
		expect(page.question()).toBe("Question one");
		page.close();
	})

	it("is not counted among the new cards", async () => {
		const page = await study(deckOf([card("one", "deck"), article("intro-a", "a"), card("two", "a", 2)]));
		expect(page.question()).toBe("Question one");
		expect(page.newCount()).toBe("2");
		page.close();
	})

	it("is read on the studier's copy when the deck was taken from the marketplace", async () => {
		const page = await study(deckOf([article("copy", "deck", { marketplace_deck_instance_id: "instance" }), card("one", "deck", 2)]));
		await page.press("Continue");
		expect(markArticleRead).toHaveBeenCalledWith({ cardId: "copy", instance: true });
		page.close();
	})

	it("is left out of a cram session, read or not", async () => {
		const page = await study(deckOf([article("intro", "deck"), card("one", "deck", 2), article("old", "a", { read: true }), card("two", "a", 2)]));
		expect(page.title()).toBe("The deck");
		await page.press("Cram");
		expect(page.title()).toBe(null);
		expect(page.question()).toBe("Question one");
		expect(page.cramCount()).toBe("Cram session: 1/2");
		page.close();
	})
})
