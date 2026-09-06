import { describe, it, expect, beforeAll } from "vitest"
import { mount, unmount, tick } from "svelte"
import FlashcardBrowse from "./FlashcardBrowse.svelte"
import MoveRefDialog from "./MoveRefDialog.svelte"
import { parseAside, moveRefContent } from "$lib/tiptap-move-ref.js"
import { replayMoves } from "$lib/board-utils.js"
import { reactiveCard } from "./move-ref-click.svelte.js"

// A move written in a card's text plays it on the board it names — the whole
// path, from the click on the rendered token to the pieces on the board.

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// cm-chessboard draws with SVG transforms, which jsdom does not implement
const installSvgStubs = () => {
	const lists = new WeakMap();
	SVGSVGElement.prototype.createSVGTransform ??= () => ({
		setTranslate(x, y) { this.x = x; this.y = y },
		setScale() {}, setRotate() {}
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
}

// A step is animated (that is what a step is), so the pieces land on their
// new squares over the board's animation rather than in the same frame; a
// click in the text or the move line is a jump, and lands at once.
const settle = () => new Promise(resolve => setTimeout(resolve, 450));

// what the board is showing, as "piece+square" pairs
const pieces = root => [...root.querySelectorAll("[data-square]")]
	.filter(el => el.dataset.piece)
	.map(el => el.dataset.piece + el.dataset.square)
	.sort().join(" ");

const boardOf = moves => ({ fen: START, moves, annotations: {}, solutionFrom: null, solutionAnnotations: {}, orientation: "w" });

const cardWith = (aside, boardMoves) => ({
	id: "card",
	front: [
		{ type: "text", content: { type: "doc", content: [{ type: "paragraph", content: aside }] } },
		{ type: "chessboards", content: [boardOf(boardMoves)] }
	],
	back: []
});

describe("a move written in a card's text", () => {
	beforeAll(() => {
		globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
		globalThis.AudioContext = class { constructor() { this.state = "running" } createBufferSource() { return { connect() {}, start() {} } } };
		installSvgStubs();
	});

	const mountCard = card => {
		const target = document.createElement("div");
		document.body.appendChild(target);
		const props = reactiveCard(card);
		const app = mount(FlashcardBrowse, { target, props });
		return { target, app };
	}

	it("plays its aside on the board it names, stopping on the move clicked", async () => {
		// the board's line is 1.e4 e5 2.Nf3; the text writes 2...Nc6 3.Bb5
		const branchFen = replayMoves({ fen: START, moves: ["e4", "e5", "Nf3"] }).fens.at(-1);
		const parsed = parseAside(branchFen, "Nc6 Bb5");
		const content = moveRefContent({ board: 1, from: 3, moves: parsed.moves, infos: parsed.infos });
		const { target, app } = mountCard(cardWith(content, ["e4", "e5", "Nf3"]));
		await tick();

		// the card opens on its own line, not on the aside
		expect(pieces(target)).toBe(pieces_of(replayMoves({ fen: START, moves: ["e4", "e5", "Nf3"] }).fens.at(-1)));

		const tokens = [...target.querySelectorAll("[data-move-ref]")];
		expect(tokens.map(el => el.textContent)).toEqual(["2…Nc6", "3.Bb5"]);

		// clicking the first move of the aside plays exactly that move
		tokens[0].click();
		await tick();
		expect(pieces(target)).toBe(pieces_of(replayMoves({ fen: START, moves: ["e4", "e5", "Nf3", "Nc6"] }).fens.at(-1)));

		// and the second plays the aside up to it
		tokens[1].click();
		await tick();
		expect(pieces(target)).toBe(pieces_of(replayMoves({ fen: START, moves: ["e4", "e5", "Nf3", "Nc6", "Bb5"] }).fens.at(-1)));

		// the aside is now in the board's move line, bracketed after the move
		// it branches from
		const asideEl = target.querySelector(".move-aside");
		expect([...asideEl.querySelectorAll(".move-btn")].map(el => el.textContent.trim()))
			.toEqual(["2…Nc6", "3.Bb5"]);
		expect(asideEl.previousElementSibling.textContent).toContain("Nf3");

		unmount(app);
	});

	it("steps back out of the aside onto the line it left", async () => {
		const branchFen = replayMoves({ fen: START, moves: ["e4", "e5", "Nf3"] }).fens.at(-1);
		const parsed = parseAside(branchFen, "Nc6 Bb5");
		const content = moveRefContent({ board: 1, from: 3, moves: parsed.moves, infos: parsed.infos });
		const { target, app } = mountCard(cardWith(content, ["e4", "e5", "Nf3"]));
		await tick();

		target.querySelectorAll("[data-move-ref]")[1].click();
		await tick();
		const back = target.querySelector('[aria-label="Previous move"]');
		const forward = target.querySelector('[aria-label="Next move"]');

		// the aside's end is the end of the road forwards
		expect(forward.disabled).toBe(true);

		back.click();          // 3.Bb5 unmade
		await settle();
		back.click();          // 2...Nc6 unmade: back on the board's own line
		await settle();
		expect(pieces(target)).toBe(pieces_of(replayMoves({ fen: START, moves: ["e4", "e5", "Nf3"] }).fens.at(-1)));
		// the board's own line ended there, so forward is still the end of the
		// road — an aside is left backwards, never run out of forwards
		expect(forward.disabled).toBe(true);
		back.click();
		await settle();
		expect(pieces(target)).toBe(pieces_of(replayMoves({ fen: START, moves: ["e4", "e5"] }).fens.at(-1)));

		unmount(app);
	});
});

// the pieces a FEN puts on the board, in the same shape as pieces()
const pieces_of = fen => {
	const [placement] = fen.split(" ");
	const out = [];
	placement.split("/").forEach((rank, r) => {
		let file = 0;
		for (const ch of rank) {
			if (ch >= "1" && ch <= "8") { file += Number(ch); continue }
			const square = "abcdefgh"[file] + (8 - r);
			const color = ch === ch.toUpperCase() ? "w" : "b";
			out.push(color + ch.toLowerCase() + square);
			file += 1;
		}
	});
	return out.sort().join(" ");
}

describe("writing one", () => {
	const openDialog = () => {
		const target = document.createElement("div");
		document.body.appendChild(target);
		let inserted = null;
		const app = mount(MoveRefDialog, {
			target,
			props: {
				boards: [{ number: 1, fen: START, moves: ["e4", "e5", "Nf3"] }],
				onInsert: content => inserted = content,
				onClose: () => {}
			}
		});
		return { target, app, read: () => inserted };
	}
	const type = async (target, text) => {
		const input = target.querySelector("input");
		input.value = text;
		input.dispatchEvent(new Event("input"));
		await tick();
	}

	it("hangs the moves off the end of the board's line by default", async () => {
		const { target, app, read } = openDialog();
		await type(target, "Nc6 Bb5");
		target.querySelector(".insert-btn").click();
		expect(read().map(node => node.text)).toEqual(["2…Nc6", " ", "3.Bb5"]);
		expect(read()[0].marks[0].attrs).toEqual({ board: 1, from: 3, moves: "Nc6 Bb5", at: 1 });
		unmount(app);
	});

	it("takes the position from the line, and numbers from there", async () => {
		const { target, app, read } = openDialog();
		// "after 1.e4": the board's first ply
		const select = target.querySelectorAll("select")[0];
		select.value = "1";
		select.dispatchEvent(new Event("change"));
		await tick();
		await type(target, "c5 Nf3");
		target.querySelector(".insert-btn").click();
		expect(read().map(node => node.text)).toEqual(["1…c5", " ", "2.Nf3"]);
		expect(read()[2].marks[0].attrs.from).toBe(1);
		unmount(app);
	});

	it("will not write a move that does not play, and says which", async () => {
		const { target, app, read } = openDialog();
		await type(target, "Nc6 Qh9");
		expect(target.querySelector(".insert-btn").disabled).toBe(true);
		expect(target.querySelector(".note").textContent).toContain("Qh9");
		target.querySelector(".insert-btn").click();
		expect(read()).toBe(null);
		unmount(app);
	});
});
