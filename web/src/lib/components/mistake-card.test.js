import { describe, it, expect, beforeAll } from "vitest"
import { mount, unmount, tick } from "svelte"
import FlashcardBrowse from "./FlashcardBrowse.svelte"
import { readGame, findMistakes, mistakeCardSpec } from "$lib/game-mistakes.js"
import { cardBuilder } from "$lib/card-spec.js"
import { reactiveCard } from "./move-ref-click.svelte.js"

// A card made from a game's mistake, as the app shows it: the board opens
// with the mistake played, and the better move written in the back plays from
// the position before it.

// what the board is showing, as "piece+square" pairs
const pieces = root => [...root.querySelectorAll("[data-square]")]
	.filter(el => el.dataset.piece)
	.map(el => el.dataset.piece + el.dataset.square)
	.sort().join(" ");

const piecesOf = fen => {
	const out = [];
	fen.split(" ")[0].split("/").forEach((rank, r) => {
		let file = 0;
		for (const ch of rank) {
			if (ch >= "1" && ch <= "8") { file += Number(ch); continue }
			out.push((ch === ch.toUpperCase() ? "w" : "b") + ch.toLowerCase() + "abcdefgh"[file] + (8 - r));
			file += 1;
		}
	});
	return out.sort().join(" ");
}

describe("a mistake's card on the board", () => {
	beforeAll(() => {
		globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
		globalThis.AudioContext = class { constructor() { this.state = "running" } createBufferSource() { return { connect() {}, start() {} } } };
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

	it("opens on the mistake and plays the better line from the text", async () => {
		const game = readGame("1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2");
		const evals = game.fens.map((_, i) => ({ cp: i <= 6 ? 30 : -400, pv: [] }));
		evals[6] = { cp: 30, pv: ["f3d4", "e5d4", "c2c3"] };
		evals[7] = { cp: -400, pv: ["d8g5", "e5f7", "g5g2"] };
		const [mistake] = findMistakes(game, evals, "w");
		const built = cardBuilder(problem => { throw new Error(problem) })
			.buildCard(mistakeCardSpec(game, mistake, { bad: "It loses a piece.", better: "Take the knight." }), "card");

		const target = document.createElement("div");
		document.body.appendChild(target);
		const app = mount(FlashcardBrowse, { target, props: reactiveCard({ id: "card", ...built }) });
		await tick();

		// the mistake, 4.Nxe5, is on the board
		expect(pieces(target)).toBe(piecesOf(game.fens[7]));

		const tokens = [...target.querySelectorAll("[data-move-ref]")];
		expect(tokens.map(el => el.textContent)).toEqual(["3…Nd4", "4.Nxd4", "exd4", "5.c3"]);

		// the better move, from the position the mistake was played in
		tokens[1].click();
		await tick();
		const better = readGame("1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxd4");
		expect(pieces(target)).toBe(piecesOf(better.fens.at(-1)));

		// the mistake and what followed it are the board's own line
		const line = target.querySelector(".move-line").textContent;
		expect(line).toContain("Nxe5");
		expect(line).toContain("Qxg2");

		unmount(app);
	});

	// a whole game under the board, when the card is about one move of it
	const longCard = openAt => ({
		id: "long",
		front: [{ type: "chessboards", content: [{
			fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
			moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6", "d3", "d6", "O-O", "O-O", "Re1", "a6", "Bb3", "Ba7", "h3", "h6", "Nbd2", "Re8"],
			annotations: {}, solutionAnnotations: {}, solutionFrom: null, openAt, orientation: "w"
		}] }],
		back: []
	});
	const lineOf = target => target.querySelector(".move-line").textContent.replace(/\s+/g, " ").trim();
	const show = async card => {
		const target = document.createElement("div");
		document.body.appendChild(target);
		const app = mount(FlashcardBrowse, { target, props: reactiveCard(card) });
		await tick();
		return { target, app };
	};

	// jsdom lays nothing out, so the widths are given: a line 466 wide (460 to lay out in), pairs
	// of 100, the step arrows and the "…" 20 each. Three pairs fit beside the
	// arrows on the first row and four on the second.
	const layOut = () => {
		const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
		const client = Object.getOwnPropertyDescriptor(Element.prototype, "clientWidth");
		Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get() {
			return this.classList.contains("move-pair") ? 100 : this.matches(".step-btn, .fold-btn") ? 20 : 0;
		} });
		Object.defineProperty(Element.prototype, "clientWidth", { configurable: true, get() {
			return this.classList.contains("move-line") ? 466 : 0;
		} });
		return () => {
			Object.defineProperty(HTMLElement.prototype, "offsetWidth", width);
			Object.defineProperty(Element.prototype, "clientWidth", client);
		};
	};
	const dots = target => [...target.querySelectorAll(".move-line .fold-btn")].filter(btn => btn.textContent.trim() === "…").map(btn => btn.getAttribute("aria-label"));
	const current = target => target.querySelector(".move-line .move-btn.current").textContent.trim();
	const step = async (target, label, times) => {
		const button = target.querySelector(`.move-line .step-btn[aria-label="${label}"]`);
		for (let i = 0; i < times; i++) { button.click(); await tick(); }
	};

	it("shows its last two rows when the move the board opens on is in them", async () => {
		const restore = layOut();
		// ten pairs; the last seven make two rows, and 8...Ba7 is among them
		const { target, app } = await show(longCard(16));
		await tick();
		expect(lineOf(target)).toBe("‹ › … 4 c3 Nf6 5 d3 d6 6 O-O O-O 7 Re1 a6 8 Bb3 Ba7 9 h3 h6 10 Nbd2 Re8");
		expect(dots(target)).toEqual(["Show the earlier moves"]);
		expect(current(target)).toBe("Ba7");

		// the … shows everything before, and is gone
		target.querySelector(".move-line .fold-btn").click();
		await tick();
		expect(lineOf(target)).toContain("‹ › ÷ 1 e4 e5 2 Nf3");
		expect(dots(target)).toEqual([]);

		// and the ÷ now standing there puts it back as it was; from a move
		// in the part that goes, the board returns to where it opened
		await step(target, "Previous move", 12);
		expect(current(target)).toBe("Nc6");
		expect(target.querySelector(".move-line .fold-btn").textContent.trim()).toBe("÷");
		target.querySelector(".move-line .fold-btn").click();
		await tick();
		await tick();
		expect(lineOf(target)).toBe("‹ › … 4 c3 Nf6 5 d3 d6 6 O-O O-O 7 Re1 a6 8 Bb3 Ba7 9 h3 h6 10 Nbd2 Re8");
		expect(current(target)).toBe("Ba7");
		unmount(app);
		restore();
	});

	it("starts one move before the move it opens on when that is further back", async () => {
		const restore = layOut();
		// opens on 2...Nc6: 2.Nf3 leads, Nc6 is the second move showing
		const { target, app } = await show(longCard(4));
		await tick();
		expect(lineOf(target)).toBe("‹ › … 2 Nf3 Nc6 3 Bc4 Bc5 4 c3 Nf6 5 d3 d6 6 O-O O-O 7 Re1 a6 8 Bb3 Ba7 …");
		expect(dots(target)).toEqual(["Show the earlier moves", "Show the later moves"]);
		expect(current(target)).toBe("Nc6");
		unmount(app);
		restore();
	});

	it("starts on a whole pair when the move before is Black's", async () => {
		const restore = layOut();
		// opens on 3.Bc4: 2...Nc6 leads, and brings 2.Nf3 with it
		const { target, app } = await show(longCard(5));
		await tick();
		expect(lineOf(target)).toBe("‹ › … 2 Nf3 Nc6 3 Bc4 Bc5 4 c3 Nf6 5 d3 d6 6 O-O O-O 7 Re1 a6 8 Bb3 Ba7 …");
		expect(current(target)).toBe("Bc4");
		unmount(app);
		restore();
	});

	it("opens a side when the board is stepped into it", async () => {
		const restore = layOut();
		const { target, app } = await show(longCard(4));
		await tick();
		// forward off the end of the second row
		await step(target, "Next move", 13);
		expect(current(target)).toBe("h3");
		expect(dots(target)).toEqual(["Show the earlier moves"]);
		expect(lineOf(target)).toContain("10 Nbd2 Re8");
		// and back past the first move showing
		await step(target, "Previous move", 16);
		expect(current(target)).toBe("e4");
		expect(dots(target)).toEqual([]);
		unmount(app);
		restore();
	});

	it("is the whole line, with no …, when it fits two rows", async () => {
		const restore = layOut();
		const card = longCard(4);
		card.front[0].content[0].moves.length = 12;
		const { target, app } = await show(card);
		await tick();
		expect(dots(target)).toEqual([]);
		expect(lineOf(target)).toContain("‹ › 1 e4 e5");
		expect(lineOf(target)).toContain("6 O-O O-O");
		unmount(app);
		restore();
	});
	it("starts the next card folded again, whatever was opened on the last", async () => {
		const restore = layOut();
		const target = document.createElement("div");
		document.body.appendChild(target);
		const props = reactiveCard(longCard(4));
		const app = mount(FlashcardBrowse, { target, props });
		await tick();
		await step(target, "Next move", 13);
		await step(target, "Previous move", 16);
		expect(dots(target)).toEqual([]);

		// a card that opens late, after one left standing on its first move
		props.card = { ...longCard(16), id: "next" };
		await tick();
		await tick();
		expect(current(target)).toBe("Ba7");
		expect(dots(target)).toEqual(["Show the earlier moves"]);
		expect(lineOf(target)).toBe("‹ › … 4 c3 Nf6 5 d3 d6 6 O-O O-O 7 Re1 a6 8 Bb3 Ba7 9 h3 h6 10 Nbd2 Re8");

		// and one that opens early, after one opened late
		props.card = { ...longCard(4), id: "third" };
		await tick();
		await tick();
		expect(current(target)).toBe("Nc6");
		expect(dots(target)).toEqual(["Show the earlier moves", "Show the later moves"]);
		unmount(app);
		restore();
	});
});
