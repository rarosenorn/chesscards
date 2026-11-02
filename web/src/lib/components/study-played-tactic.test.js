import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest"
import { mount, unmount, tick } from "svelte"
import { createEmptyCard, Rating } from "ts-fsrs"
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
const { updateCardStudyStateAndAddLog } = await import("$lib/cards.remote.js");

// A tactic played on the board grades itself: one Next button, Correct if
// the puzzle went through with no wrong move, Incorrect if one went astray
// or Show gave the answer first.

const text = words => [{ type: "text", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: words }] }] } }];
// after 1.e4 e5, White to find 2.Nf3
const puzzle = {
	fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
	moves: ["Nf3"], annotations: {}, orientation: "w", openAt: 0, solutionFrom: 0, puzzle: true
};
const tactic = (id, front) => ({
	...createEmptyCard(new Date(Date.now() - 1000)),
	id, deck_id: "deck", position: 1, card_type: "tactic", finished_at: null, reps: 0,
	front, back: text("Develop.")
});
const played = id => tactic(id, [...text("White to play"), { type: "chessboards", content: [puzzle] }]);
const deckOf = cards => ({
	id: "deck", name: "The deck", inOrder: true, intro: null, ancestors: [],
	decks: [{ id: "deck", name: "The deck", position: 1, parent_id: null, in_order: true, intro: null }],
	cards
});

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

describe("a tactic played on the board", () => {
	beforeAll(() => {
		globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
		globalThis.AudioContext = class { constructor() { this.state = "running" } createBufferSource() { return { connect() {}, start() {} } } };
		window.scrollTo = () => {};
		// cm-chessboard draws with SVG transforms, which jsdom does not implement
		const lists = new WeakMap();
		SVGSVGElement.prototype.createSVGTransform ??= () => ({
			setTranslate(x, y) { this.x = x; this.y = y }, setScale() {}, setRotate() {}
		});
		if (!Object.getOwnPropertyDescriptor(SVGElement.prototype, "transform")) {
			Object.defineProperty(SVGElement.prototype, "transform", {
				get() {
					if (!lists.has(this)) {
						const items = [];
						lists.set(this, { baseVal: {
							get numberOfItems() { return items.length },
							appendItem: t => (items.push(t), t),
							removeItem: i => items.splice(i, 1)[0],
							getItem: i => items[i],
							clear: () => { items.length = 0 }
						} });
					}
					return lists.get(this);
				}
			});
		}
	});
	beforeEach(() => {
		const kept = new Map();
		vi.stubGlobal("localStorage", {
			getItem: key => kept.get(key) ?? null,
			setItem: (key, value) => { kept.set(key, String(value)) },
			removeItem: key => { kept.delete(key) },
			get length() { return kept.size },
			key: index => [...kept.keys()][index] ?? null
		});
		updateCardStudyStateAndAddLog.mockClear();
	});

	const study = async cards => {
		const target = document.createElement("div");
		document.body.append(target);
		const app = mount(Study, {
			target,
			context: new Map([["deck", reactiveProps(deckOf(cards))], ["studyState", reactiveProps({ turnedCardId: null, cram: null, played: null })]])
		});
		await tick();
		const buttons = () => [...target.querySelectorAll(".flashcard-btn-row button")].map(el => el.textContent.trim());
		const button = label => [...target.querySelectorAll("button")].find(el => el.textContent.trim() === label);
		const square = name => target.querySelector(`.board-container [data-square="${name}"]:not([data-piece])`)
			?? target.querySelector(`.board-container [data-square="${name}"]`);
		const mouse = (type, el) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientX: 0, clientY: 0 }));
		return {
			buttons,
			// the label over the one grade button
			label: () => target.querySelector(".flashcard-btn-row .eval-btn p")?.textContent.trim(),
			press: async label => { button(label).click(); await tick(); },
			key: async key => { document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); await tick(); },
			// a move made by clicking its two squares, then the beats the
			// board takes to answer, take back, or report the line through
			move: async (from, to) => {
				mouse("mousedown", square(from)); mouse("mouseup", square(from));
				mouse("mousedown", square(to)); mouse("mouseup", square(to));
				await wait(400);
				await tick();
			},
			close: () => { unmount(app); target.remove(); }
		};
	}

	it("found at once: one Next, graded Correct", async () => {
		const page = await study([played("p")]);
		expect(page.buttons()).toEqual(["Show"]);
		await page.move("g1", "f3");
		expect(page.buttons()).toEqual(["Next"]);
		expect(page.label()).toBe("14d");
		await page.key(" ");
		expect(updateCardStudyStateAndAddLog).toHaveBeenCalledTimes(1);
		expect(updateCardStudyStateAndAddLog.mock.calls[0][0].log.rating).toBe(Rating.Good);
		page.close();
	})

	it("climbs the ladder its deck sets", async () => {
		const withLadder = (cards, ladder) => ({ ...deckOf(cards), decks: deckOf(cards).decks.map(entry => ({ ...entry, ladder })) });
		const target = document.createElement("div");
		document.body.append(target);
		const app = mount(Study, {
			target,
			context: new Map([["deck", reactiveProps(withLadder([{ ...played("p"), reps: 1 }], [3, 10]))], ["studyState", reactiveProps({ turnedCardId: null, cram: null, played: null })]])
		});
		await tick();
		const square = name => target.querySelector(`.board-container [data-square="${name}"]:not([data-piece])`)
			?? target.querySelector(`.board-container [data-square="${name}"]`);
		const mouse = (type, el) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientX: 0, clientY: 0 }));
		for (const name of ["g1", "f3"]) { mouse("mousedown", square(name)); mouse("mouseup", square(name)); }
		await wait(400);
		await tick();
		expect(target.querySelector(".flashcard-btn-row .eval-btn p")?.textContent.trim()).toBe("10d");
		expect(target.querySelectorAll(".ladder .step")).toHaveLength(2);
		unmount(app);
		target.remove();
	})

	it("found after a wrong move: Next grades Incorrect", async () => {
		const page = await study([played("p")]);
		await page.move("d2", "d4");
		expect(page.buttons()).toEqual(["Show"]);
		await page.move("g1", "f3");
		expect(page.buttons()).toEqual(["Next"]);
		expect(page.label()).toBe("1d");
		await page.press("Next");
		expect(updateCardStudyStateAndAddLog.mock.calls[0][0].log.rating).toBe(Rating.Again);
		page.close();
	})

	it("shown before it is played: Incorrect, and a clean replay after Hide does not change it", async () => {
		const page = await study([played("p")]);
		await page.press("Show");
		expect(page.label()).toBe("1d");
		await page.key("h");
		expect(page.buttons()).toEqual(["Show"]);
		await page.move("g1", "f3");
		expect(page.buttons()).toEqual(["Next"]);
		expect(page.label()).toBe("1d");
		await page.press("Next");
		expect(updateCardStudyStateAndAddLog.mock.calls[0][0].log.rating).toBe(Rating.Again);
		page.close();
	})

	it("comes back fresh after its grade", async () => {
		const page = await study([played("p"), { ...played("q"), position: 2 }]);
		await page.press("Show");
		await page.press("Next");
		await page.move("g1", "f3");
		expect(page.label()).toBe("14d");
		page.close();
	})

	it("a tactic with no puzzle keeps Incorrect and Correct", async () => {
		const page = await study([tactic("t", text("What is the motif?"))]);
		await page.press("Show");
		expect(page.buttons()).toEqual(["Incorrect", "Correct"]);
		page.close();
	})
})
