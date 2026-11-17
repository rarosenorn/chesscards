import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest"
import { mount, unmount, tick } from "svelte"
import { createEmptyCard } from "ts-fsrs"
import { reactiveProps } from "./move-ref-click.svelte.js"
import { parseAside, moveRefContent } from "$lib/tiptap-move-ref.js"
import { replayMoves } from "$lib/board-utils.js"

vi.mock("$app/state", () => ({ page: { url: new URL("http://localhost/my-flashcards/deck/study"), params: {} } }));
vi.mock("$app/forms", () => ({ enhance: () => ({}) }));
vi.mock("$lib/cards.remote.js", () => ({
	updateCardStudyStateAndAddLog: vi.fn(async () => {}),
	logPractice: vi.fn(async () => {}),
	completeCramSession: vi.fn(async () => 1),
	updateCardContent: vi.fn(async () => {}),
	updateCardType: vi.fn(async () => {}),
	deleteCards: vi.fn(async () => {})
}));

const { default: Study } = await import("./Study.svelte");

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const LINE = ["d4", "d5", "c4", "e6", "Nc3"];
const fenAfter = moves => replayMoves({ fen: START, moves }).fens.at(-1);
const pieces = root => [...root.querySelectorAll(".board-container [data-square]")]
	.filter(el => el.dataset.piece).map(el => el.dataset.piece + el.dataset.square).sort().join(" ");
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
};

const paragraph = content => ({ type: "text", content: { type: "doc", content: [{ type: "paragraph", content }] } });
const card = () => {
	const parsed = parseAside(fenAfter(LINE), "c5 Nf3 Nc6");
	return {
		...createEmptyCard(new Date(Date.now() - 1000)),
		id: "c", deck_id: "deck", position: 1, card_type: "basic", finished_at: null, reps: 0,
		front: [
			paragraph([{ type: "text", text: "Play the line." }]),
			{ type: "chessboards", content: [{ fen: START, moves: LINE, annotations: {}, solutionAnnotations: {}, orientation: "w", openAt: 1, solutionFrom: 1 }] }
		],
		back: [paragraph(moveRefContent({ board: 1, from: 5, moves: parsed.moves, infos: parsed.infos }))]
	};
};
const deckOf = cards => ({
	id: "deck", name: "The deck", inOrder: true, intro: null, ancestors: [],
	decks: [{ id: "deck", name: "The deck", position: 1, parent_id: null, in_order: true, intro: null }],
	cards
});

describe("Hide on a card whose board follows a move in the back's text", () => {
	beforeAll(() => {
		globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
		globalThis.AudioContext = class { constructor() { this.state = "running" } createBufferSource() { return { connect() {}, start() {} } } };
		window.scrollTo = () => {};
		const lists = new WeakMap();
		SVGSVGElement.prototype.createSVGTransform ??= () => ({ setTranslate(x, y) { this.x = x; this.y = y }, setScale() {}, setRotate() {} });
		if (!Object.getOwnPropertyDescriptor(SVGElement.prototype, "transform")) {
			Object.defineProperty(SVGElement.prototype, "transform", { get() {
				if (!lists.has(this)) { const items = []; lists.set(this, { baseVal: { get numberOfItems() { return items.length }, appendItem: t => (items.push(t), t), removeItem: i => items.splice(i, 1)[0], getItem: i => items[i], clear: () => { items.length = 0 } } }); }
				return lists.get(this);
			} });
		}
	});
	beforeEach(() => {
		const kept = new Map();
		vi.stubGlobal("localStorage", {
			getItem: key => kept.get(key) ?? null, setItem: (key, value) => { kept.set(key, String(value)) },
			removeItem: key => { kept.delete(key) }, get length() { return kept.size }, key: index => [...kept.keys()][index] ?? null
		});
	});

	it("puts the board back on the question, and Show again does not return to the text's line", async () => {
		const target = document.createElement("div");
		document.body.append(target);
		const app = mount(Study, {
			target,
			context: new Map([["deck", reactiveProps(deckOf([card()]))], ["studyState", reactiveProps({ turnedCardId: null, cram: null, played: null })]])
		});
		await tick();
		const press = async label => { [...target.querySelectorAll("button")].find(el => el.textContent.trim() === label).click(); await tick(); await tick(); };
		const question = piecesOf(fenAfter(["d4"]));
		expect(pieces(target)).toBe(question);

		await press("Show");
		const tokens = [...target.querySelectorAll("[data-move-ref]")];
		tokens.at(-1).click();
		await tick();
		expect(pieces(target)).toBe(piecesOf(fenAfter([...LINE, "c5", "Nf3", "Nc6"])));

		await press("Hide");
		expect(pieces(target)).toBe(question);
		expect(target.querySelector(".move-line").textContent).not.toContain("d5");
		expect(target.querySelector(".move-line .move-btn.current")?.textContent.trim()).toBe("d4");

		await press("Show");
		expect(pieces(target)).toBe(question);

		unmount(app);
		target.remove();
	});
});
