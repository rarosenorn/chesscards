import { Node } from "@tiptap/core"
import { Fragment } from "@tiptap/pm/model"
import { mount, unmount } from "svelte"
import ChessboardBlockNode from "$lib/components/ChessboardBlockNode.svelte"
import { isInteractive, isDragEvent } from "$lib/tiptap-chessboard.svelte.js"

// The add-cards editor's chessboard block: a whole v1-style block of boards
// (side by side, managed by its own buttons and svelte-dnd board dragging)
// embedded in the text document. The block is NOT a letter — it just takes
// up space; the text caret lives in the lines around it, and a virtual board
// caret (see ./caret.js) simulates per-board letter behavior inside it.

export const isBlock = node => node?.type.name === "chessboardBlock";

// pasted/duplicated content gets fresh block and board ids
export const withFreshIds = fragment => {
	const nodes = [];
	fragment.forEach(node => {
		if (isBlock(node)) {
			nodes.push(node.type.create({ id: crypto.randomUUID(), boards: freshBoards(node.attrs.boards ?? []) }));
		} else {
			nodes.push(node.copy(withFreshIds(node.content)));
		}
	});
	return Fragment.fromArray(nodes);
}

const freshBoards = boards => boards.map(b => ({ ...b, id: crypto.randomUUID() }));

export const BlockNode = Node.create({
	name: "chessboardBlock",
	group: "block",
	atom: true,
	draggable: false,
	// part of text selections, never a lone node selection
	selectable: false,

	addOptions() {
		return { ui: null, isBack: false }
	},

	addAttributes() {
		return {
			// identity for the virtual board caret (block-caret-state); client
			// only, never stored
			id: {
				default: null,
				parseHTML: () => null,
				renderHTML: () => ({})
			},
			boards: {
				default: [],
				// serialized into the DOM so the clipboard and cross-editor
				// drags carry the boards along
				parseHTML: el => {
					try {
						return JSON.parse(el.getAttribute("data-chessboard-block"))
					} catch {
						return []
					}
				},
				renderHTML: attrs => ({ "data-chessboard-block": JSON.stringify(attrs.boards) })
			}
		}
	},

	parseHTML() {
		return [{ tag: "div[data-chessboard-block]" }]
	},

	renderHTML({ HTMLAttributes }) {
		return ["div", HTMLAttributes]
	},

	addNodeView() {
		return ({ node, editor, getPos }) => {
			const dom = document.createElement("div");
			dom.className = "board-block";
			// blocks are not draggable objects — they don't "exist" as units;
			// boards move via their own svelte-dnd drag (and blocks via
			// cut/paste of their boards)
			dom.draggable = false;
			// inputs inside the island must work normally
			dom.contentEditable = "false";

			let editing = false;
			const setEditing = value => {
				editing = value;
				dom.classList.toggle("board-block-editing", value);
			}

			dom.dataset.blockId = node.attrs.id ?? "";

			const props = $state({
				boards: node.attrs.boards,
				blockId: node.attrs.id,
				isBack: this.options.isBack,
				ui: this.options.ui,
				// whole-array attr replacement — one undo step per change
				onUpdate: boards => {
					const pos = getPos();
					if (pos == null) return;
					editor.view.dispatch(editor.view.state.tr.setNodeAttribute(pos, "boards", boards));
				},
				onEditingChange: setEditing,
				// clicking a board parks the caret virtually (also how a closed
				// board editor hands focus back); PM keeps focus so the keymap
				// drives it
				onCaretActivated: () => editor.view.focus()
			});
			const component = mount(ChessboardBlockNode, { target: dom, props });

			return {
				dom,
				update: n => {
					if (!isBlock(n)) return false;
					props.boards = n.attrs.boards;
					props.blockId = n.attrs.id;
					dom.dataset.blockId = n.attrs.id ?? "";
					return true;
				},
				// caret keydowns (arrows, Enter) outside inputs always reach
				// the view, so the virtual caret stays keyboard-live beside an
				// open editor (the editor's moves mode claims arrows first —
				// see ChessboardEditor's root arrow handler)
				stopEvent: e => {
					if (e.type === "keydown" && (e.key.startsWith("Arrow") || e.key === "Enter") && !isInteractive(e.target)) return false;
					return !isDragEvent(e) && (editing || isInteractive(e.target));
				},
				ignoreMutation: () => true,
				destroy: () => unmount(component)
			}
		}
	}
})
