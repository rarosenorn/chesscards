import { describe, it, expect, beforeAll, vi } from "vitest"
import { mount, unmount, tick } from "svelte"
import { createEmptyCard } from "ts-fsrs"
import { reactiveProps } from "./move-ref-click.svelte.js"

vi.mock("$lib/deck.remote.js", () => ({ moveCards: vi.fn(), listDecks: vi.fn(async () => []), copyCards: vi.fn() }));
vi.mock("$app/state", () => ({ page: { url: new URL("http://localhost/my-flashcards/deck/browse"), params: { id: "deck" } } }));
vi.mock("$lib/cards.remote.js", () => ({
	updateCardContent: vi.fn(async () => {}),
	updateCardType: vi.fn(async () => {}),
	deleteCards: vi.fn(async () => {})
}));

const { default: Cards } = await import("./Cards.svelte");

const text = words => [{ type: "text", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: words }] }] } }];
// after 1.e4 e5, White to find 2.Nf3
const puzzle = {
	fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
	moves: ["Nf3"], annotations: {}, orientation: "w", openAt: 0, solutionFrom: 0, puzzle: true
};
const card = (id, position, extra = {}) => ({
	...createEmptyCard(new Date(Date.now() - 1000)),
	id, deck_id: "deck", position, card_type: "basic", finished_at: null, front: text(`Front ${id}`), back: text(`Back ${id}`), ...extra
});
const deckOf = cards => ({
	id: "deck", name: "The deck", isMarketplace: false, ancestors: [],
	decks: [
		{ id: "deck", name: "The deck", position: 1, parent_id: null, in_order: true },
		{ id: "t", name: "Taken", position: 1, parent_id: "deck", in_order: true, bought: true, instance_id: "t" }
	],
	cards
});

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

describe("the Browse preview with the back hidden", () => {
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

	const open = async cards => {
		const target = document.createElement("div");
		document.body.append(target);
		const app = mount(Cards, { target, context: new Map([["deck", reactiveProps(deckOf(cards))], ["cardDrafts", reactiveProps({})]]) });
		await tick();
		const pane = () => target.querySelector(".selected-card-container");
		const button = label => [...pane().querySelectorAll("button")].find(el => el.textContent.trim() === label);
		const square = name => pane().querySelector(`.board-container [data-square="${name}"]:not([data-piece])`)
			?? pane().querySelector(`.board-container [data-square="${name}"]`);
		const mouse = (type, el) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, clientX: 0, clientY: 0 }));
		return {
			preview: () => pane().querySelector(".flashcard").textContent,
			buttons: () => [...pane().querySelectorAll(".card-toolbar button")].map(el => el.textContent.trim()),
			press: async label => { button(label).click(); await tick(); },
			key: async (key, init = {}) => { document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init })); await tick(); },
			move: async (from, to) => {
				mouse("mousedown", square(from)); mouse("mouseup", square(from));
				mouse("mousedown", square(to)); mouse("mouseup", square(to));
				await wait(400);
				await tick();
			},
			close: () => { unmount(app); target.remove(); }
		};
	}

	it("shows the back until the eye hides it; then each card comes up front only until Show, Space, or H back", async () => {
		const view = await open([card("x1", 1), card("x2", 2)]);
		expect(view.preview()).toContain("Back x1");
		expect(view.buttons()).toEqual(["Back", "Edit card"]);

		await view.press("Back");
		expect(view.preview()).toContain("Front x1");
		expect(view.preview()).not.toContain("Back x1");
		expect(view.buttons()).toEqual(["Show", "Back", "Edit card"]);

		await view.press("Show");
		expect(view.preview()).toContain("Back x1");
		expect(view.buttons()).toEqual(["Back", "Edit card"]);

		// the next card comes up hidden
		await view.key("ArrowDown", { ctrlKey: true });
		expect(view.preview()).toContain("Front x2");
		expect(view.preview()).not.toContain("Back x2");

		await view.key(" ");
		expect(view.preview()).toContain("Back x2");
		await view.key("h");
		expect(view.preview()).not.toContain("Back x2");

		// the eye open again shows everything
		await view.press("Back");
		expect(view.preview()).toContain("Back x2");
		expect(view.buttons()).toEqual(["Back", "Edit card"]);
		view.close();
	})

	it("is there on a marketplace card too, which has no Edit", async () => {
		const view = await open([card("m1", 1, { deck_id: "t", marketplace_deck_instance_id: "t" })]);
		expect(view.buttons()).toEqual(["Back"]);
		await view.press("Back");
		expect(view.preview()).not.toContain("Back m1");
		expect(view.buttons()).toEqual(["Show", "Back"]);
		view.close();
	})

	it("hides a front board's back moves, and turns the card once its puzzle is played", async () => {
		const view = await open([card("p", 1, { card_type: "tactic", front: [...text("White to play"), { type: "chessboards", content: [puzzle] }], back: text("Develop.") })]);
		expect(view.preview()).toContain("Nf3");
		await view.press("Back");
		expect(view.preview()).not.toContain("Nf3");
		expect(view.preview()).not.toContain("Develop.");
		await view.move("g1", "f3");
		expect(view.preview()).toContain("Develop.");
		expect(view.buttons()).toEqual(["Back", "Edit card"]);
		view.close();
	})
})
