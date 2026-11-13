import { describe, it, expect, beforeAll, vi } from "vitest"
import { mount, unmount, tick } from "svelte"
import Chessboard from "./Chessboard.svelte"
import DescriptionView from "./DescriptionView.svelte"

vi.mock("$app/forms", () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock("$app/navigation", () => ({ beforeNavigate: () => {} }));
vi.mock("$app/environment", () => ({ browser: true }));

describe("the Play link", () => {
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

	const show = async board => {
		const target = document.createElement("div");
		document.body.appendChild(target);
		const app = mount(Chessboard, { target, props: { board: { annotations: {}, orientation: "w", ...board }, analysis: true } });
		await tick();
		const link = [...target.querySelectorAll("a")].find(a => a.textContent === "Play");
		unmount(app);
		return link;
	}

	it("opens Lichess's game against the computer from the position the board shows", async () => {
		const link = await show({ fen: "8/4p3/4k3/8/3K4/8/8/8 w - - 0 1", moves: ["Ke4", "Kd6", "Kd4"], openAt: 1 });
		expect(link.getAttribute("href")).toBe("https://lichess.org/?fen=8%2F4p3%2F4k3%2F8%2F4K3%2F8%2F8%2F8%20b%20-%20-%201%201#ai");
		expect(link.getAttribute("target")).toBe("_blank");
	});

	it("is not there on a stalemate, where there is nothing to play", async () => {
		expect(await show({ fen: "8/8/8/8/8/2k5/2p5/2K5 w - - 2 5", moves: [] })).toBeUndefined();
		expect(await show({ fen: "8/8/8/8/2pk4/8/3K4/8 w - - 0 1", moves: ["Kc2", "c3", "Kc1", "Kd3", "Kd1", "c2+", "Kc1", "Kc3"], openAt: 8 })).toBeUndefined();
	});

	it("is on the boards of articles and deck descriptions, beside Analyse", async () => {
		const target = document.createElement("div");
		document.body.appendChild(target);
		const app = mount(DescriptionView, { target, props: { blocks: [{ type: "chessboards", content: [{ fen: "8/4p3/4k3/8/3K4/8/8/8 w - - 0 1", moves: [], annotations: {}, orientation: "w" }] }] } });
		await tick();
		expect([...target.querySelectorAll("a")].map(a => a.textContent)).toEqual(["Analyse", "Play"]);
		unmount(app);
	});

	it("is on the boards of the card editor, and a click on it leaves the board as it was", async () => {
		const { default: CardBlockEdit } = await import("./CardBlockEdit.svelte");
		const text = words => ({ type: "text", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: words }] }] } });
		const target = document.createElement("div");
		document.body.appendChild(target);
		const app = mount(CardBlockEdit, { target, props: { card: { front: [text("Front"), { type: "chessboards", content: [{ fen: "8/4p3/4k3/8/3K4/8/8/8 w - - 0 1", moves: [], annotations: {}, orientation: "w" }] }], back: [text("Back")] }, onSave: async () => {}, onCancel: () => {} } });
		for (let i = 0; i < 5; i++) { await tick(); await new Promise(resolve => setTimeout(resolve)); }
		const links = [...target.querySelectorAll(".board-node a, .board-grid-node a, .board-cell a")];
		expect(links.map(a => a.textContent)).toEqual(["Analyse", "Play"]);
		const before = target.innerHTML;
		links[0].dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
		const click = new MouseEvent("click", { bubbles: true, cancelable: true });
		links[0].dispatchEvent(click);
		for (let i = 0; i < 3; i++) await tick();
		expect(click.defaultPrevented).toBe(false);
		expect(target.querySelector(".board-cell .button-row")).not.toBeNull();
		expect(target.innerHTML.length).toBe(before.length);
		unmount(app);
		target.remove();
	});
});
