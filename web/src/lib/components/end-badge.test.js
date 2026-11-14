import { describe, it, expect, beforeAll, vi } from "vitest"
import { mount, unmount, tick } from "svelte"
import Chessboard from "./Chessboard.svelte"
import { reactiveProps } from "./move-ref-click.svelte.js"

vi.mock("$app/forms", () => ({ enhance: () => ({ destroy() {} }) }));
vi.mock("$app/navigation", () => ({ beforeNavigate: () => {} }));
vi.mock("$app/environment", () => ({ browser: true }));

describe("the end-of-game marks", () => {
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

	const marks = async (board, aside = null) => {
		const target = document.createElement("div");
		document.body.appendChild(target);
		const props = reactiveProps({ board: { annotations: {}, orientation: "w", moves: [], ...board }, aside: null });
		const app = mount(Chessboard, { target, props });
		await tick();
		if (aside) props.aside = aside;
		await tick();
		await tick();
		const found = [...target.querySelectorAll(".end-badge")].map(b => b.getAttribute("aria-label"));
		unmount(app);
		target.remove();
		return found;
	}

	const shuffle = ["Kd2", "Kd5", "Ke2", "Ke5"];
	const rookEnding = "8/8/8/4k3/8/8/4K3/7R w - - 0 1";

	it("mark the mated king alone", async () => {
		expect(await marks({ fen: "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2", moves: ["Qh4#"], openAt: 1 })).toEqual(["Checkmate"]);
	});

	it("mark both kings on a stalemate", async () => {
		expect(await marks({ fen: "8/8/8/8/8/2k5/2p5/2K5 w - - 2 5" })).toEqual(["Stalemate", "Stalemate"]);
	});

	it("mark both kings when too little is left to mate", async () => {
		expect(await marks({ fen: "8/8/8/4k3/8/8/4K3/8 w - - 0 1" })).toEqual(["Draw", "Draw"]);
		expect(await marks({ fen: "8/8/8/4k3/8/8/4K3/5B2 w - - 0 1" })).toEqual(["Draw", "Draw"]);
	});

	it("mark both kings on the fiftieth move without a capture or a pawn move, and not before", async () => {
		const board = { fen: "8/8/8/4k3/8/8/4K3/7R w - - 99 80", moves: ["Kd2"] };
		expect(await marks({ ...board, openAt: 1 })).toEqual(["Draw", "Draw"]);
		expect(await marks({ ...board, openAt: 0 })).toEqual([]);
	});

	it("mark both kings when the line repeats a position a third time, and not on the second", async () => {
		const board = { fen: rookEnding, moves: [...shuffle, ...shuffle] };
		expect(await marks({ ...board, openAt: 8 })).toEqual(["Draw", "Draw"]);
		expect(await marks({ ...board, openAt: 7 })).toEqual([]);
		expect(await marks({ ...board, openAt: 4 })).toEqual([]);
	});

	it("count an aside's positions with the line's before it", async () => {
		const board = { fen: rookEnding, moves: shuffle, openAt: 4 };
		expect(await marks(board, { from: 4, moves: shuffle, at: 4 })).toEqual(["Draw", "Draw"]);
		expect(await marks(board, { from: 4, moves: shuffle, at: 3 })).toEqual([]);
	});

	it("leave a game that goes on unmarked", async () => {
		expect(await marks({ fen: rookEnding })).toEqual([]);
	});
});
