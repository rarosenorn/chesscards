import { describe, it, expect, beforeEach, vi } from "vitest"
import { mount, unmount, tick } from "svelte"
import { createEmptyCard } from "ts-fsrs"
import { reactiveProps } from "./move-ref-click.svelte.js"
import { forgetIntrosRead } from "$lib/intros.js"

// Study is mounted outside the app: its page, its form helper and the
// server it reports grades to are stand-ins
vi.mock("$app/state", () => ({ page: { url: new URL("http://localhost/my-flashcards/deck/study"), params: {} } }));
vi.mock("$app/forms", () => ({ enhance: () => ({}) }));
vi.mock("$lib/cards.remote.js", () => ({
	updateCardStudyStateAndAddLog: vi.fn(async () => {}),
	logPractice: vi.fn(async () => {}),
	completeCramSession: vi.fn(async () => 1),
	updateCardContent: vi.fn(async () => {}),
	updateCardType: vi.fn(async () => {}),
	deleteCards: vi.fn(async () => {})
}));

const { default: Study } = await import("./Study.svelte");

// An intro page stands where the card would, before the first card of a deck
// and of a subdeck is studied — the whole path, from the page coming up to
// the card after it.

const text = words => [{ type: "text", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: words }] }] } }];
const card = (id, subdeck_id, seen = false) => ({
	...createEmptyCard(new Date(Date.now() - 1000)),
	// a card met before: on a real schedule, and not due for a while
	...(seen ? { state: 2, reps: 1, due: new Date(Date.now() + 5 * 864e5), last_review: new Date(Date.now() - 864e5), scheduled_days: 6 } : {}),
	id, deck_id: "deck", subdeck_id, position: 1, card_type: "basic", finished_at: null,
	front: text(`Question ${id}`), back: text(`Answer ${id}`)
});
const deckOf = (cards, overrides = {}) => ({
	id: "deck", name: "The deck", usesSubdecks: true, progressionDepth: 0, intro: text("The deck's page"),
	subdecks: [
		{ id: "a", name: "First", position: 1, parent_id: null, intro: text("First's page") },
		{ id: "b", name: "Second", position: 2, parent_id: null, intro: null }
	],
	cards,
	...overrides
});

describe("an intro page in study", () => {
	// a browser's storage, kept in memory for the test
	const storage = () => {
		const kept = new Map();
		return {
			getItem: key => kept.get(key) ?? null,
			setItem: (key, value) => { kept.set(key, String(value)) },
			removeItem: key => { kept.delete(key) },
			get length() { return kept.size },
			key: index => [...kept.keys()][index] ?? null
		};
	}
	beforeEach(() => {
		vi.stubGlobal("localStorage", storage());
		// jsdom has neither: a page's text blocks watch their own size, and
		// the first key pressed wakes the app's sounds
		globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
		globalThis.AudioContext = class { constructor() { this.state = "running" } createBufferSource() { return { connect() {}, start() {} } } };
		window.scrollTo = () => {};
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
			title: () => target.querySelector(".intro h1")?.textContent ?? null,
			question: () => target.querySelector(".flashcard.card-surface .text-block")?.textContent.trim() ?? null,
			press: async label => { button(label).click(); await tick(); },
			key: async key => { document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); await tick(); },
			close: () => { unmount(app); target.remove(); }
		};
	}

	it("comes up before the first card: the deck's, then the subdeck's, then the card", async () => {
		const page = await study(deckOf([card("one", "a"), card("two", "b")]));
		expect(page.title()).toBe("The deck");
		expect(page.question()).toBe(null);
		// the card under it takes no keys: Space does not show an answer
		await page.key(" ");
		expect(page.title()).toBe("The deck");

		await page.press("Study");
		expect(page.title()).toBe("First");
		// the name above the title leads back to that page
		await page.press("The deck");
		expect(page.title()).toBe("The deck");
		await page.press("Study");
		expect(page.title()).toBe("First");

		await page.key("Enter");
		expect(page.title()).toBe(null);
		expect(page.question()).toBe("Question one");
		expect(page.button("Show")).toBeTruthy();
		page.close();
	})

	it("is passed for good once passed: not again on coming back, nor after a grade", async () => {
		const deck = deckOf([card("one", "a"), card("two", "b")]);
		let page = await study(deck);
		await page.press("Study");
		await page.press("Study");
		expect(page.question()).toBe("Question one");
		page.close();

		// back before any grade: the browser remembers
		page = await study(deck);
		expect(page.title()).toBe(null);
		expect(page.question()).toBe("Question one");

		// graded: the next card is of a subdeck with no page, in a deck now begun
		await page.key(" ");
		await page.key("3");
		expect(page.title()).toBe(null);
		expect(page.question()).toBe("Question two");
		page.close();
	})

	it("is read again from the Intro button, the one nearest the card", async () => {
		const page = await study(deckOf([card("one", "a"), card("two", "b")]));
		await page.press("Study");
		await page.press("Study");
		expect(page.button("Intro")).toBeTruthy();

		await page.press("Intro");
		expect(page.title()).toBe("First");
		expect(page.button("Intro")).toBeFalsy();
		await page.press("Study");
		expect(page.question()).toBe("Question one");
		page.close();
	})

	it("does not come up for what has been begun", async () => {
		// a card of First met before: the deck and First are begun
		const page = await study(deckOf([card("one", "a", true), { ...card("three", "a"), position: 2 }, card("two", "b")]));
		expect(page.title()).toBe(null);
		expect(page.question()).toBe("Question three");
		// ...and their pages are still there to read
		await page.press("Intro");
		expect(page.title()).toBe("First");
		page.close();
	})

	it("comes up again after a reset has forgotten it", async () => {
		const deck = deckOf([card("one", "a")]);
		let page = await study(deck);
		await page.press("Study");
		await page.press("Study");
		page.close();

		forgetIntrosRead(deck);
		page = await study(deck);
		expect(page.title()).toBe("The deck");
		page.close();
	})

	it("is still passed one after the other where the browser keeps nothing", async () => {
		vi.stubGlobal("localStorage", undefined);
		const page = await study(deckOf([card("one", "a")]));
		expect(page.title()).toBe("The deck");
		await page.press("Study");
		expect(page.title()).toBe("First");
		await page.press("Study");
		expect(page.title()).toBe(null);
		expect(page.question()).toBe("Question one");
		page.close();
	})

	it("is the deck's alone where the deck does not use its subdecks", async () => {
		const page = await study(deckOf([card("one", "a")], { usesSubdecks: false }));
		expect(page.title()).toBe("The deck");
		await page.press("Study");
		expect(page.question()).toBe("Question one");
		page.close();
	})

	it("is not there at all for a deck without any", async () => {
		const page = await study(deckOf([card("one", "b")], { intro: null }));
		expect(page.title()).toBe(null);
		expect(page.question()).toBe("Question one");
		expect(page.button("Intro")).toBeFalsy();
		page.close();
	})

	it("can be read with no card up, and closed", async () => {
		// nothing due: the deck is done for now
		const page = await study(deckOf([card("one", "a", true)]));
		expect(page.question()).toBe(null);
		await page.press("Intro");
		expect(page.title()).toBe("The deck");
		await page.press("Close");
		expect(page.title()).toBe(null);
		page.close();
	})
})
