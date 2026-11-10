import { describe, it, expect, beforeAll, vi } from "vitest"
import { mount, unmount, tick } from "svelte"

vi.mock("$app/forms", () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock("$app/navigation", () => ({ beforeNavigate: () => {} }));
vi.mock("$app/environment", () => ({ browser: true }));

const { default: CardBlockEdit } = await import("./CardBlockEdit.svelte");

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const KINGS = "4k3/8/8/8/8/8/8/4K3 w - - 0 1";
const text = words => ({ type: "text", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: words }] }] } });
const boardOf = (fen, moves = []) => ({ fen, moves, annotations: {}, orientation: "w" });

beforeAll(() => {
	globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
	globalThis.AudioContext = class { constructor() { this.state = "running" } createBufferSource() { return { connect() {}, start() {} } } };
	Object.defineProperty(HTMLElement.prototype, "offsetParent", { configurable: true, get() { return this.parentNode } });
	Element.prototype.getAnimations ??= () => [];
	const lists = new WeakMap();
	SVGSVGElement.prototype.createSVGTransform ??= () => ({ setTranslate() {}, setScale() {}, setRotate() {} });
	if (!Object.getOwnPropertyDescriptor(SVGElement.prototype, "transform")) {
		Object.defineProperty(SVGElement.prototype, "transform", { get() {
			if (!lists.has(this)) { const items = []; lists.set(this, { baseVal: { get numberOfItems() { return items.length }, appendItem: t => (items.push(t), t), removeItem: i => items.splice(i, 1)[0], getItem: i => items[i], clear: () => { items.length = 0 } } }); }
			return lists.get(this);
		} });
	}
});

const settle = async () => { for (let i = 0; i < 5; i++) { await tick(); await new Promise(resolve => setTimeout(resolve)); } };

// a paste as the browser sends it: the clipboard's text, line breaks and all
const paste = (input, clipboard) => {
	const event = new Event("paste", { bubbles: true, cancelable: true });
	Object.defineProperty(event, "clipboardData", { value: { getData: type => type === "text/plain" ? clipboard : "" } });
	input.dispatchEvent(event);
	return event;
}

const open = async board => {
	const onSave = vi.fn(async () => {});
	const target = document.createElement("div");
	document.body.append(target);
	const app = mount(CardBlockEdit, { target, props: { card: { front: [text("Front"), { type: "chessboards", content: [board] }], back: [text("Back")] }, onSave, onCancel: () => {} } });
	await settle();
	const button = label => [...target.querySelectorAll("button")].find(el => el.textContent.trim() === label);
	const saved = async () => {
		button("Save").click();
		await settle();
		return JSON.parse(onSave.mock.calls.at(-1)[0]).find(block => block.type === "chessboards").content[0];
	}
	return { target, button, saved, close: () => { unmount(app); target.remove(); } };
}

describe("pasting a PGN where a FEN goes", () => {
	it("on the board in the card: takes the game's start and its moves", async () => {
		const view = await open(boardOf(KINGS));
		const field = view.target.querySelector(".button-row input");
		const event = paste(field, '[Event "Live Chess"]\n\n1. e4 {[%clk 0:02:59]} e5\n2. Nf3 Nc6 1-0');
		expect(event.defaultPrevented).toBe(true);
		await settle();
		const board = await view.saved();
		expect([board.fen, board.moves]).toEqual([START, ["e4", "e5", "Nf3", "Nc6"]]);
		view.close();
	})

	it("in the open board editor: takes the game's start and its moves", async () => {
		const view = await open(boardOf(KINGS, ["Kd2"]));
		view.button("Edit").click();
		await settle();
		const field = view.target.querySelector(".fen-input");
		paste(field, '[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4q3/R3K3 b Q - 0 30"]\n\n30... Qb5 31. Kd2 Qd5+');
		await settle();
		expect(field.value).toBe("4k3/8/8/8/8/8/4q3/R3K3 b Q - 0 30");
		expect(view.target.querySelector(".fen-input")).toBe(field);
		// the board editor's own Save first, then the card's
		view.button("Save").click();
		await settle();
		const board = await view.saved();
		expect([board.fen, board.moves]).toEqual(["4k3/8/8/8/8/8/4q3/R3K3 b Q - 0 30", ["Qb5", "Kd2", "Qd5+"]]);
		view.close();
	})

	it("leaves a pasted FEN to the field as before", async () => {
		const view = await open(boardOf(KINGS));
		const field = view.target.querySelector(".button-row input");
		const event = paste(field, START);
		expect(event.defaultPrevented).toBe(false);
		view.close();
	})
})
