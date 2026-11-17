import { describe, it, expect, vi } from "vitest"
import { mount, unmount, tick } from "svelte"
import { createEmptyCard, default_w } from "ts-fsrs"
import { reactiveProps } from "./move-ref-click.svelte.js"

vi.mock("$app/state", () => ({ page: { url: new URL("http://localhost/my-flashcards/deck/study"), params: {} } }));
vi.mock("$app/forms", () => ({ enhance: () => ({}) }));
vi.mock("$lib/cards.remote.js", () => ({
	updateCardStudyStateAndAddLog: vi.fn(async () => {}), logPractice: vi.fn(async () => {}), completeCramSession: vi.fn(async () => 1),
	updateCardContent: vi.fn(async () => {}), updateCardType: vi.fn(async () => {}), deleteCards: vi.fn(async () => {})
}));

const { default: Study } = await import("./Study.svelte");

const text = words => [{ type: "text", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: words }] }] } }];
const card = {
	...createEmptyCard(new Date(Date.now() - 6 * 864e5)),
	state: 2, reps: 3, stability: 5, difficulty: 5, scheduled_days: 5,
	due: new Date(Date.now() - 864e5), last_review: new Date(Date.now() - 6 * 864e5),
	id: "c", deck_id: "deck", position: 1, card_type: "basic", finished_at: null, front: text("Question"), back: text("Answer")
};
const deck = {
	id: "deck", name: "The deck", inOrder: true, reviewsInOrder: false, intro: null, ancestors: [],
	decks: [{ id: "deck", name: "The deck", position: 1, parent_id: null, in_order: true, intro: null }],
	cards: [card]
};

describe("a refit landing during study", () => {
	it("schedules from then on with the new parameters", async () => {
		globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
		globalThis.AudioContext = class { constructor() { this.state = "running" } createBufferSource() { return { connect() {}, start() {} } } };
		window.scrollTo = () => {};
		let land;
		const refitted = new Promise(resolve => { land = resolve });
		const target = document.createElement("div");
		document.body.append(target);
		const app = mount(Study, {
			target, props: { fsrsParameters: null, refitted },
			context: new Map([["deck", reactiveProps(deck)], ["studyState", reactiveProps({ turnedCardId: null, cram: null, played: null })]])
		});
		await tick();
		document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
		await tick();
		const intervals = () => [...target.querySelectorAll(".eval-btn p")].map(p => p.textContent.trim());
		const before = intervals();
		// a memory that grows much faster on a recall
		land(default_w.map((w, i) => i === 8 ? w + 1 : w));
		await refitted;
		await tick();
		expect(before).toHaveLength(4);
		expect(intervals()[2]).not.toBe(before[2]);
		unmount(app);
		target.remove();
	})

	it("goes on with the parameters it has when the refit never arrives", async () => {
		const target = document.createElement("div");
		document.body.append(target);
		const app = mount(Study, {
			target, props: { fsrsParameters: null, refitted: Promise.reject(new Error("stream closed")) },
			context: new Map([["deck", reactiveProps(deck)], ["studyState", reactiveProps({ turnedCardId: null, cram: null, played: null })]])
		});
		await new Promise(resolve => setTimeout(resolve, 0));
		await tick();
		expect(target.querySelector(".flashcard")).toBeTruthy();
		unmount(app);
		target.remove();
	})

	it("schedules for the recall the user chose: a lower target, longer intervals", async () => {
		const goodAt = async desiredRetention => {
			const target = document.createElement("div");
			document.body.append(target);
			const app = mount(Study, {
				target, props: { fsrsParameters: null, desiredRetention },
				context: new Map([["deck", reactiveProps(structuredClone(deck))], ["studyState", reactiveProps({ turnedCardId: null, cram: null, played: null })]])
			});
			await tick();
			document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
			await tick();
			const good = [...target.querySelectorAll(".eval-btn p")][2].textContent.trim();
			unmount(app);
			target.remove();
			return parseInt(good);
		}
		expect(await goodAt(0.8)).toBeGreaterThan(await goodAt(0.97));
	})

	it("schedules each card for its own deck's desired retention, not the user's", async () => {
		const goodIn = async deckRetention => {
			const target = document.createElement("div");
			document.body.append(target);
			const own = { ...structuredClone(deck), decks: [{ ...deck.decks[0], desiredRetention: deckRetention }] };
			const app = mount(Study, {
				target, props: { fsrsParameters: null, desiredRetention: 0.95 },
				context: new Map([["deck", reactiveProps(own)], ["studyState", reactiveProps({ turnedCardId: null, cram: null, played: null })]])
			});
			await tick();
			document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
			await tick();
			const good = parseInt([...target.querySelectorAll(".eval-btn p")][2].textContent);
			unmount(app);
			target.remove();
			return good;
		}
		expect(await goodIn(0.8)).toBeGreaterThan(await goodIn(undefined));
		expect(await goodIn(0.97)).toBeLessThan(await goodIn(undefined));
	})
})

