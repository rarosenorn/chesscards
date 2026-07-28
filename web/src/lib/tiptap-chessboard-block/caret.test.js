import { describe, it, expect, afterEach } from "vitest"
import { Editor } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import Paragraph from "@tiptap/extension-paragraph"
import Text from "@tiptap/extension-text"
import { BlockNode } from "./node.svelte.js"
import { BlockNavigation } from "./caret.js"
import { boardCaret, setBoardCaret, clearBoardCaret, boardClipboard } from "$lib/block-caret-state.svelte.js"

// Headless scenario tests for the caret/deletion/merge spec in
// docs/features.md. The editor runs on jsdom with the Svelte node view
// swapped for a bare div: everything here exercises ProseMirror state and
// the caret module, not rendering. Visual-order navigation (arrows) needs
// real layout and is exercised in the browser instead.

const HeadlessBlock = BlockNode.extend({
	addNodeView() {
		return () => ({ dom: document.createElement("div") })
	}
})

const board = id => ({
	id,
	fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
	moves: [],
	annotations: {},
	solutionFrom: null,
	solutionAnnotations: {},
	orientation: "w"
});
const blockJson = (id, boardIds) => ({ type: "chessboardBlock", attrs: { id, boards: boardIds.map(board) } });
const para = text => ({ type: "paragraph", content: text ? [{ type: "text", text }] : undefined });

let editor;
const makeEditor = nodes => {
	editor = new Editor({
		element: document.createElement("div"),
		extensions: [
			Document, Paragraph, Text, BlockNavigation,
			HeadlessBlock.configure({ ui: { editingIds: new Set(), editorStates: {}, applyEditors: {}, invalidBoards: {} } })
		],
		content: { type: "doc", content: nodes }
	});
	return editor;
};

afterEach(() => {
	editor?.destroy();
	editor = null;
	clearBoardCaret();
	boardCaret.anchor = null;
	boardClipboard.boards = null;
});

const key = (k, mods = {}) =>
	editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...mods }));

const docNodes = () => editor.getJSON().content;
const boardIds = node => (node.attrs.boards ?? []).map(b => b.id);

describe("deletion from text beside a block", () => {
	it("backspace on an empty line below joins it away and the caret enters the block", () => {
		makeEditor([blockJson("A", ["a1", "a2"]), para(""), para("x")]);
		editor.commands.setTextSelection(2);
		key("Backspace");
		const nodes = docNodes();
		expect(nodes.map(n => n.type)).toEqual(["chessboardBlock", "paragraph"]);
		expect(boardIds(nodes[0])).toEqual(["a1", "a2"]);
		expect(boardCaret.blockId).toBe("A");
		expect(boardCaret.index).toBe(2);
	});

	it("backspace at the start of a non-empty line deletes only the nearest board", () => {
		makeEditor([blockJson("A", ["a1", "a2"]), para("xy")]);
		editor.commands.setTextSelection(2);
		key("Backspace");
		const nodes = docNodes();
		expect(boardIds(nodes[0])).toEqual(["a1"]);
		expect(nodes[1].content[0].text).toBe("xy");
		expect(boardCaret.blockId).toBe(null);
	});

	it("delete on an empty line above joins it away and the caret enters the block", () => {
		makeEditor([para(""), blockJson("A", ["a1"])]);
		editor.commands.setTextSelection(1);
		key("Delete");
		const nodes = docNodes();
		expect(nodes[0].type).toBe("chessboardBlock");
		expect(boardCaret.blockId).toBe("A");
		expect(boardCaret.index).toBe(0);
	});

	it("delete on an empty last line with a block above is consumed, not left to the browser", () => {
		makeEditor([blockJson("A", ["a1"]), para("")]);
		editor.commands.setTextSelection(2);
		const before = JSON.stringify(editor.getJSON());
		key("Delete");
		expect(JSON.stringify(editor.getJSON())).toBe(before);
		expect(boardCaret.blockId).toBe(null);
	});
});

describe("merging adjacent blocks", () => {
	it("deleting the only line between two blocks merges them, first id surviving", () => {
		makeEditor([blockJson("A", ["a1"]), para(""), blockJson("B", ["b1"])]);
		editor.commands.setTextSelection(2);
		key("Backspace");
		const nodes = docNodes();
		expect(nodes).toHaveLength(1);
		expect(nodes[0].attrs.id).toBe("A");
		expect(boardIds(nodes[0])).toEqual(["a1", "b1"]);
		expect(boardCaret.blockId).toBe("A");
		expect(boardCaret.index).toBe(1);
	});

	it("any doc change merges blocks that sit adjacent", () => {
		makeEditor([blockJson("A", ["a1"]), para(""), blockJson("B", ["b1"]), para("t")]);
		editor.commands.deleteRange({ from: 1, to: 3 });
		const nodes = docNodes();
		expect(nodes.map(n => n.type)).toEqual(["chessboardBlock", "paragraph"]);
		expect(boardIds(nodes[0])).toEqual(["a1", "b1"]);
	});
});

describe("in-block deletion", () => {
	it("backspace removes the board before the caret", () => {
		makeEditor([blockJson("A", ["a1", "a2"])]);
		setBoardCaret("A", 2, "up");
		key("Backspace");
		expect(boardIds(docNodes()[0])).toEqual(["a1"]);
		expect(boardCaret.index).toBe(1);
	});

	it("a shift-range deletes exactly the selected boards", () => {
		makeEditor([blockJson("A", ["a1", "a2", "a3"])]);
		setBoardCaret("A", 2, "up");
		boardCaret.anchor = 0;
		key("Backspace");
		expect(boardIds(docNodes()[0])).toEqual(["a3"]);
		expect(boardCaret.index).toBe(0);
		expect(boardCaret.anchor).toBe(null);
	});

	it("deleting the last board dissolves the block into an empty line", () => {
		makeEditor([blockJson("A", ["a1"]), para("x")]);
		setBoardCaret("A", 1, "up");
		key("Backspace");
		const nodes = docNodes();
		expect(nodes.map(n => n.type)).toEqual(["paragraph", "paragraph"]);
		expect(boardCaret.blockId).toBe(null);
	});
});

describe("Enter and typing at a gap", () => {
	it("Enter before the first board pushes a line in above, caret staying put", () => {
		makeEditor([para("t"), blockJson("A", ["a1"])]);
		setBoardCaret("A", 0, "down");
		key("Enter");
		const nodes = docNodes();
		expect(nodes.map(n => n.type)).toEqual(["paragraph", "paragraph", "chessboardBlock"]);
		expect(boardCaret.blockId).toBe("A");
		expect(boardCaret.index).toBe(0);
	});

	it("Enter mid-block splits it with the text caret on the line between", () => {
		makeEditor([blockJson("A", ["a1", "a2"])]);
		setBoardCaret("A", 1, "up");
		key("Enter");
		const nodes = docNodes();
		expect(nodes.map(n => n.type)).toEqual(["chessboardBlock", "paragraph", "chessboardBlock"]);
		expect(nodes[0].attrs.id).toBe("A");
		expect(boardIds(nodes[0])).toEqual(["a1"]);
		expect(boardIds(nodes[2])).toEqual(["a2"]);
		expect(nodes[2].attrs.id).not.toBe("A");
		expect(boardCaret.blockId).toBe(null);
	});

	it("typing at the end gap makes the line below carrying the character", () => {
		makeEditor([blockJson("A", ["a1"])]);
		setBoardCaret("A", 1, "up");
		key("x");
		const nodes = docNodes();
		expect(nodes.map(n => n.type)).toEqual(["chessboardBlock", "paragraph"]);
		expect(nodes[1].content[0].text).toBe("x");
		expect(boardCaret.blockId).toBe(null);
	});
});

describe("board clipboard", () => {
	it("cut takes the board before the caret; paste inserts fresh copies", () => {
		makeEditor([blockJson("A", ["a1", "a2"])]);
		setBoardCaret("A", 1, "up");
		key("x", { ctrlKey: true });
		expect(boardIds(docNodes()[0])).toEqual(["a2"]);
		expect(boardClipboard.boards).toHaveLength(1);
		key("v", { ctrlKey: true });
		const ids = boardIds(docNodes()[0]);
		expect(ids).toHaveLength(2);
		expect(ids[0]).not.toBe("a1");
		expect(ids[1]).toBe("a2");
		expect(boardCaret.index).toBe(1);
	});

	it("pasting with the text caret touching a block joins that block", () => {
		makeEditor([blockJson("A", ["a1"]), para("yz")]);
		boardClipboard.boards = [board("c1")];
		editor.commands.setTextSelection(2);
		key("v", { ctrlKey: true });
		const nodes = docNodes();
		expect(nodes).toHaveLength(2);
		const ids = boardIds(nodes[0]);
		expect(ids).toHaveLength(2);
		expect(ids[0]).toBe("a1");
		expect(ids[1]).not.toBe("c1");
		expect(boardCaret.blockId).toBe("A");
		expect(boardCaret.index).toBe(2);
	});

	it("pasting mid-text creates a new block at the caret's line", () => {
		makeEditor([para("yz")]);
		boardClipboard.boards = [board("c1")];
		editor.commands.setTextSelection(2);
		key("v", { ctrlKey: true });
		const nodes = docNodes();
		expect(nodes.map(n => n.type)).toEqual(["paragraph", "chessboardBlock"]);
		expect(boardIds(nodes[1])).toHaveLength(1);
	});
});

describe("normalizer bookkeeping", () => {
	it("blocks born without an id get one on the next change", () => {
		makeEditor([{ type: "chessboardBlock", attrs: { boards: [board("z1")] } }, para("x")]);
		editor.commands.insertContentAt(4, "y");
		expect(docNodes()[0].attrs.id).toBeTruthy();
	});
});
