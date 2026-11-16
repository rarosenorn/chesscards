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

// The waits over the grade buttons: a step that would end past the next
// rollover is waiting from that day's start, so it reads "1d", as in Anki
const text = words => [{ type: "text", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: words }] }] } }];
const newCard = () => ({
	...createEmptyCard(new Date(Date.now() - 864e5)),
	id: "c1", deck_id: "deck", position: 1, card_type: "basic", finished_at: null,
	front: text("Question"), back: text("Answer")
});
const deck = () => ({
	id: "deck", name: "The deck", inOrder: true, reviewsInOrder: false, intro: null, ancestors: [],
	decks: [{ id: "deck", name: "The deck", position: 1, parent_id: null, in_order: true, intro: null }],
	cards: [newCard()]
});

describe("the waits over the grade buttons", () => {
	beforeEach(() => {
		const kept = new Map();
		vi.stubGlobal("localStorage", { getItem: key => kept.get(key) ?? null, setItem: (key, value) => { kept.set(key, String(value)) }, removeItem: key => { kept.delete(key) }, get length() { return kept.size }, key: index => [...kept.keys()][index] ?? null });
		globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
		globalThis.AudioContext = class { constructor() { this.state = "running" } createBufferSource() { return { connect() {}, start() {} } } };
		window.scrollTo = () => {};
	});
	afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() });

	const labels = async now => {
		vi.useFakeTimers({ now, toFake: ["Date"] });
		const target = document.createElement("div");
		document.body.append(target);
		const app = mount(Study, { target, context: new Map([["deck", reactiveProps(deck())], ["studyState", reactiveProps({ turnedCardId: null, cram: null, played: null })]]) });
		await tick();
		document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
		await tick();
		const shown = [...target.querySelectorAll(".eval-btn p")].map(p => p.textContent.trim());
		unmount(app);
		target.remove();
		return shown;
	}

	it("a step past the next rollover reads 1d; one before it keeps its minutes", async () => {
		expect(await labels(new Date(2026, 10, 17, 3, 55))).toEqual(["1m", "1d", "1d", "3d"]);
	});

	it("away from the rollover, steps read in minutes", async () => {
		expect(await labels(new Date(2026, 10, 17, 15, 0))).toEqual(["1m", "6m", "10m", "3d"]);
	});
});
