import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mount, unmount, tick } from "svelte"
import { createEmptyCard } from "ts-fsrs"
import { reactiveProps } from "./move-ref-click.svelte.js"

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

// Cards due for review come shuffled, or, where the deck at the top says so,
// in the order new cards come: deck by deck in a deck taking its decks in
// order, one from each in turn in a mixed one.

const text = words => [{ type: "text", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: words }] }] } }];
// a card on a real schedule, due since yesterday
const due = (id, deck_id, position) => ({
	...createEmptyCard(new Date(Date.now() - 6 * 864e5)),
	state: 2, reps: 3, stability: 5, difficulty: 5, scheduled_days: 5,
	due: new Date(Date.now() - 864e5), last_review: new Date(Date.now() - 6 * 864e5),
	id, deck_id, position, card_type: "basic", finished_at: null,
	front: text(`Question ${id}`), back: text(`Answer ${id}`)
});
const deckOf = ({ reviewsInOrder, inOrder = true }) => ({
	id: "deck", name: "The deck", inOrder, reviewsInOrder, intro: null, ancestors: [],
	decks: [
		{ id: "deck", name: "The deck", position: 1, parent_id: null, in_order: inOrder, intro: null },
		{ id: "a", name: "First", position: 1, parent_id: "deck", in_order: true, intro: null },
		{ id: "b", name: "Second", position: 2, parent_id: "deck", in_order: true, intro: null }
	],
	cards: [due("a1", "a", 1), due("a2", "a", 2), due("b1", "b", 1), due("b2", "b", 2)]
});

describe("due cards", () => {
	beforeEach(() => {
		const kept = new Map();
		vi.stubGlobal("localStorage", {
			getItem: key => kept.get(key) ?? null,
			setItem: (key, value) => { kept.set(key, String(value)) },
			removeItem: key => { kept.delete(key) },
			get length() { return kept.size },
			key: index => [...kept.keys()][index] ?? null
		});
		globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
		globalThis.AudioContext = class { constructor() { this.state = "running" } createBufferSource() { return { connect() {}, start() {} } } };
		window.scrollTo = () => {};
	});
	afterEach(() => vi.restoreAllMocks());

	// every question in the order it comes up, each graded Good
	const session = async deck => {
		const target = document.createElement("div");
		document.body.append(target);
		const app = mount(Study, {
			target,
			context: new Map([["deck", reactiveProps(deck)], ["studyState", reactiveProps({ turnedCardId: null, cram: null, played: null })]])
		});
		await tick();
		const key = async key => { document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); await tick(); };
		const seen = [];
		for (let question; (question = target.querySelector(".flashcard.card-surface .text-block")?.textContent.trim()); ) {
			seen.push(question.replace("Question ", ""));
			await key(" ");
			await key("3");
		}
		unmount(app);
		target.remove();
		return seen;
	}

	it("come in the deck's order where it takes them in order", async () => {
		expect(await session(deckOf({ reviewsInOrder: true }))).toEqual(["a1", "a2", "b1", "b2"]);
	})

	it("come one from each deck in turn where the decks inside are mixed", async () => {
		expect(await session(deckOf({ reviewsInOrder: true, inOrder: false }))).toEqual(["a1", "b1", "a2", "b2"]);
	})

	it("come shuffled otherwise", async () => {
		let next = 1;
		vi.spyOn(Math, "random").mockImplementation(() => next++ / 10);
		const order = await session(deckOf({ reviewsInOrder: false }));
		expect(order).toHaveLength(4);
		expect(order).not.toEqual(["a1", "a2", "b1", "b2"]);
	})
})
