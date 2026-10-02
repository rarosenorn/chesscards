import { describe, it, expect, beforeAll } from "vitest"
import { mount, unmount, tick } from "svelte"
import Chessboard from "./Chessboard.svelte"
import { reactiveProps } from "./move-ref-click.svelte.js"

// Study shows one card after another in the same board component: the next
// card's board has to be the next card's, line and opening position both.
describe("a board handed the next card", () => {
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

	const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
	const line = target => target.querySelector(".move-line").textContent.replace(/\s+/g, " ").trim();
	const current = target => target.querySelector(".move-line .move-btn.current")?.textContent.trim();

	it("shows that card's line up to its own hidden moves, opened where it opens", async () => {
		const first = { fen: START, moves: ["e4", "e5", "Nf3", "Nc6", "Nc3", "Bc5", "Nxe5"], annotations: {}, orientation: "w", openAt: 6, solutionFrom: 6 };
		const second = { fen: START, moves: ["e4", "e5", "Nf3", "Nc6", "Nc3", "Bc5", "Nxe5", "Qh4", "g3"], annotations: {}, orientation: "w", openAt: 8, solutionFrom: 8, solutionAnnotations: { 8: { arrows: [{ type: "success", from: "g2", to: "g3" }] } } };
		const target = document.createElement("div");
		document.body.appendChild(target);
		const props = reactiveProps({ board: first, revealed: false, onSolved: () => {} });
		const app = mount(Chessboard, { target, props });
		await tick();
		expect(current(target)).toBe("Bc5");

		props.board = second;
		await tick();
		await tick();
		expect(line(target)).toContain("4 Nxe5 Qh4");
		expect(current(target)).toBe("Qh4");

		// and turned, then on to a third: back at that one's own question
		props.revealed = true;
		await tick();
		props.revealed = false;
		props.board = first;
		await tick();
		await tick();
		expect(current(target)).toBe("Bc5");
		expect(line(target)).not.toContain("Nxe5");
		unmount(app);
	});
});
