import { describe, it, expect, beforeAll } from "vitest"
import { mount, unmount, tick } from "svelte"
import Chessboard from "./Chessboard.svelte"

describe("the side-to-move marker", () => {
	beforeAll(() => {
		globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
		globalThis.AudioContext = class { constructor() { this.state = "running" } createBufferSource() { return { connect() {}, start() {} } } };
		const lists = new WeakMap();
		SVGSVGElement.prototype.createSVGTransform ??= () => ({ setTranslate() {}, setScale() {}, setRotate() {} });
		if (!Object.getOwnPropertyDescriptor(SVGElement.prototype, "transform")) {
			Object.defineProperty(SVGElement.prototype, "transform", { get() {
				if (!lists.has(this)) { const items = []; lists.set(this, { baseVal: { get numberOfItems() { return items.length }, appendItem: t => (items.push(t), t), removeItem: i => items.splice(i, 1)[0], getItem: i => items[i], clear: () => { items.length = 0 } } }); }
				return lists.get(this);
			} });
		}
	});

	const marker = async board => {
		const target = document.createElement("div");
		document.body.appendChild(target);
		const app = mount(Chessboard, { target, props: { board: { annotations: {}, orientation: "w", ...board } } });
		await tick();
		const label = target.querySelector(".side-to-move")?.getAttribute("aria-label") ?? null;
		const step = () => target.querySelector("[role=group]").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
		return { label, step, after: async () => { await tick(); return target.querySelector(".side-to-move")?.getAttribute("aria-label") ?? null }, close: () => { unmount(app); target.remove() } };
	}

	it("says whose move it is where the board opens, not at the start of its line", async () => {
		const view = await marker({ fen: "8/4p3/4k3/8/3K4/8/8/8 w - - 0 1", moves: ["Ke4"], openAt: 1 });
		expect(view.label).toBe("Black to move");
		view.close();
	});

	it("opening at the start, says the start's", async () => {
		const view = await marker({ fen: "8/4p3/4k3/8/3K4/8/8/8 w - - 0 1", moves: ["Ke4", "Kd6"] });
		expect(view.label).toBe("White to move");
		view.step();
		expect(await view.after()).toBe("White to move");
		view.close();
	});

	it("is not there when the board opens on a finished position", async () => {
		const view = await marker({ fen: "8/8/8/8/2pk4/8/3K4/8 w - - 0 1", moves: ["Kc2", "c3", "Kc1", "Kd3", "Kd1", "c2+", "Kc1", "Kc3"], openAt: 8 });
		expect(view.label).toBeNull();
		view.close();
	});
});
