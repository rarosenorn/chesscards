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
	const lineOf = target => target.querySelector(".move-line").textContent.replace(/\s+/g, " ");
	const show = async card => {
		const target = document.createElement("div");
		document.body.appendChild(target);
		const app = mount(FlashcardBrowse, { target, props: reactiveCard(card) });
		await tick();
		return { target, app };
	};

	it("folds the moves that led up to where the board opens", async () => {
		const { target, app } = await show(longCard(16));
		// 8...Ba7 is on the board; the line starts two moves before it
		expect(target.querySelector(".fold-btn")).not.toBe(null);
		expect(lineOf(target)).not.toContain("Nf3");
		expect(lineOf(target)).toContain("6 O-O O-O");
		expect(lineOf(target)).toContain("Re8");
		expect(target.querySelector(".move-btn.current").textContent.trim()).toBe("Ba7");

		target.querySelector(".fold-btn").click();
		await tick();
		expect(target.querySelector(".fold-btn")).toBe(null);
		expect(lineOf(target)).toContain("1 e4 e5");
		unmount(app);
	});

	it("unfolds when the board is stepped back into them", async () => {
		const { target, app } = await show(longCard(16));
		const back = target.querySelector('.step-btn[aria-label="Previous move"]');
		for (let i = 0; i < 10 && target.querySelector(".fold-btn"); i++) { back.click(); await tick(); }
		expect(target.querySelector(".fold-btn")).toBe(null);
		expect(lineOf(target)).toContain("1 e4 e5");
		unmount(app);
	});

	it("leaves a line alone that opens near its start", async () => {
		const { target, app } = await show(longCard(6));
		expect(target.querySelector(".fold-btn")).toBe(null);
		expect(lineOf(target)).toContain("1 e4 e5");
		unmount(app);
	});
});
