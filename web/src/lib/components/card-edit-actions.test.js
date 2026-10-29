import { describe, it, expect, beforeAll, vi } from "vitest"
import { mount, unmount, tick } from "svelte"
import { reactiveProps } from "./move-ref-click.svelte.js"

// The add-cards page mounted outside the app: the form posts nowhere
vi.mock("$app/forms", () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock("$app/navigation", () => ({ beforeNavigate: () => {} }));
vi.mock("$app/environment", () => ({ browser: true }));
vi.mock("$app/state", () => ({ page: { url: new URL("http://localhost/my-flashcards/deck/add-cards"), params: { id: "deck" } } }));

const { default: CardBlockEdit } = await import("./CardBlockEdit.svelte");
const { default: AddCards } = await import("../../routes/(standard-layout)/my-flashcards/[id=uuid]/add-cards/+page.svelte");

// The buttons that end an edit — Cancel and Save, Add card — sit under the
// card, not inside it, and Tab still cycles through them and the two sides.

const text = words => [{ type: "text", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: words }] }] } }];
const deck = { id: "deck", name: "The deck", isMarketplace: false, ancestors: [], decks: [{ id: "deck", name: "The deck", position: 1, parent_id: null }], cards: [] };

beforeAll(() => {
	globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
	globalThis.AudioContext = class { constructor() { this.state = "running" } createBufferSource() { return { connect() {}, start() {} } } };
	// jsdom lays nothing out, so nothing has an offsetParent: the trap would
	// see every stop as hidden
	Object.defineProperty(HTMLElement.prototype, "offsetParent", { configurable: true, get() { return this.parentNode } });
});

const open = async (Component, options) => {
	const target = document.createElement("div");
	document.body.append(target);
	const app = mount(Component, { target, ...options });
	await tick();
	const button = label => [...target.querySelectorAll("button")].find(el => el.textContent.trim() === label);
	const side = i => target.querySelectorAll(".editor-wrap .text-area > .ProseMirror")[i];
	const tab = async (el, shiftKey = false) => {
		el.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true }));
		await tick();
	};
	// a stop holds the focus when it is the focused element or holds it
	const focused = el => el === document.activeElement || el.contains(document.activeElement);
	return { target, button, side, tab, focused, close: () => { unmount(app); target.remove(); } };
};

const under = (card, button) => !card.contains(button)
	&& (card.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe("editing a card", () => {
	it("puts Cancel and Save under the card, and tabs through them", async () => {
		const onSave = vi.fn(async () => {});
		const onCancel = vi.fn();
		const view = await open(CardBlockEdit, { props: { card: { front: text("Front"), back: text("Back") }, onSave, onCancel } });
		const card = view.target.querySelector(".card-surface");
		expect(card.contains(view.side(0))).toBe(true);
		expect(under(card, view.button("Cancel"))).toBe(true);
		expect(under(card, view.button("Save"))).toBe(true);

		view.button("Save").focus();
		await view.tab(view.button("Save"));
		expect(view.focused(view.side(0))).toBe(true);
		view.button("Cancel").focus();
		await view.tab(view.button("Cancel"), true);
		expect(view.focused(view.side(1))).toBe(true);

		view.button("Save").click();
		await tick();
		expect(onSave).toHaveBeenCalledOnce();
		view.button("Cancel").click();
		expect(onCancel).toHaveBeenCalledOnce();
		view.close();
	});
});

describe("the add-cards page", () => {
	it("puts Add card under the card, and tabs through it", async () => {
		const view = await open(AddCards, { context: new Map([["deck", reactiveProps(deck)]]) });
		const card = view.target.querySelector(".card-surface");
		expect(card.contains(view.side(0))).toBe(true);
		expect(under(card, view.button("Add card"))).toBe(true);

		view.button("Add card").focus();
		await view.tab(view.button("Add card"));
		expect(view.focused(view.side(0))).toBe(true);
		view.side(0).focus();
		await view.tab(view.side(0), true);
		expect(document.activeElement).toBe(view.button("Add card"));
		view.close();
	});
});
