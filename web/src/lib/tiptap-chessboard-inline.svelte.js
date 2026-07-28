import { Node } from "@tiptap/core"
import { Plugin } from "@tiptap/pm/state"
import { TextSelection } from "@tiptap/pm/state"
import { Fragment, Slice } from "@tiptap/pm/model"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { mount, unmount } from "svelte"
import ChessboardNode from "$lib/components/ChessboardNode.svelte"
import { newBoard } from "$lib/card-utils.js"
import { startFen, isInteractive, isDragEvent, guardDraggable } from "$lib/tiptap-chessboard.svelte.js"

// The Add cards 4 trial: a chessboard is an INLINE atom node — literally a
// giant letter inside a paragraph. The native text caret sits between boards
// (correct height, native blink), and clicks, arrows, Enter, joins, range
// selections, copy/cut/paste, and drag and drop are ProseMirror's native text
// behavior rather than the hand-built caret system of the block variant
// (tiptap-chessboard.svelte.js).

const InlineBoardNode = Node.create({
	name: "chessboard",
	group: "inline",
	inline: true,
	atom: true,
	draggable: true,
	// part of text selections, never a lone node selection
	selectable: false,

	addOptions() {
		// ui: shared { editingIds, editorStates, applyEditors } (see
		// ChessboardNode.svelte); isBack marks the back side's editor
		return { ui: null, isBack: false }
	},

	addAttributes() {
		return {
			data: {
				default: null,
				// serialized into the DOM so the clipboard and cross-editor
				// drags carry the board along
				parseHTML: el => {
					try {
						return JSON.parse(el.getAttribute("data-chessboard"))
					} catch {
						return null
					}
				},
				renderHTML: attrs => ({ "data-chessboard": JSON.stringify(attrs.data) })
			}
		}
	},

	parseHTML() {
		return [{ tag: "span[data-chessboard]" }, { tag: "div[data-chessboard]" }]
	},

	renderHTML({ HTMLAttributes }) {
		return ["span", HTMLAttributes]
	},

	addNodeView() {
		return ({ node, editor, getPos }) => {
			const dom = document.createElement("span");
			dom.className = "board-inline";
			// Text semantics for the mouse: a board is draggable only while
			// selected (like selected text) — otherwise press+drag runs the
			// native sweep-selection. The selection plugin below keeps the
			// draggable flag in sync.
			dom.draggable = false;
			// inputs inside the island must work normally
			dom.contentEditable = "false";
			const unguard = guardDraggable(dom, () => !editing && dom.classList.contains("board-selected"));

			// an open board editor is inert to PM and not draggable, exactly
			// like the block variant
			let editing = false;
			const setEditing = value => {
				editing = value;
				dom.classList.toggle("board-inline-editing", value);
				dom.draggable = !value && dom.classList.contains("board-selected");
			}

			const props = $state({
				board: node.attrs.data,
				isBack: this.options.isBack,
				ui: this.options.ui,
				// below the 370px node box, so the board never overflows it
				// (the selection tint overlay covers exactly the node box)
				boardMinWidth: "360px",
				// whole-object attr replacement — one undo step per board edit
				onUpdate: data => {
					const pos = getPos();
					if (pos == null) return;
					editor.view.dispatch(editor.view.state.tr.setNodeAttribute(pos, "data", data));
				},
				onEditingChange: setEditing,
				// closing the editor puts the (native) caret after the board
				onCaretAfter: () => {
					const pos = getPos();
					if (pos == null) return;
					const view = editor.view;
					view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 1)));
					view.focus();
				}
			});
			const component = mount(ChessboardNode, { target: dom, props });

			// clicks over the island don't resolve to caret positions natively
			// (posAtCoords is null there) — place the caret on the clicked
			// side. A sweep-select ending here also fires click: the movement
			// guard keeps it from collapsing the fresh selection.
			let pressAt = null;
			dom.addEventListener("mousedown", e => pressAt = [e.clientX, e.clientY]);
			dom.addEventListener("click", e => {
				if (editing || isInteractive(e.target)) return;
				if (pressAt && Math.hypot(e.clientX - pressAt[0], e.clientY - pressAt[1]) > 4) return;
				const pos = getPos();
				if (pos == null) return;
				const rect = dom.getBoundingClientRect();
				const after = e.clientX > rect.left + rect.width / 2;
				const view = editor.view;
				view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, after ? pos + 1 : pos)));
				view.focus();
			});

			return {
				dom,
				update: n => {
					if (n.type.name !== "chessboard") return false;
					props.board = n.attrs.data;
					return true;
				},
				stopEvent: e => !isDragEvent(e) && (editing || isInteractive(e.target)),
				ignoreMutation: () => true,
				destroy: () => {
					unguard();
					unmount(component);
				}
			}
		}
	},

	addProseMirrorPlugins() {
		return [
			// Boards keep their own lines, like the block variant: any
			// paragraph mixing text and boards splits, in order, into text
			// paragraphs and board paragraphs (the caret maps along, so
			// typing beside a board feels like starting a text line)
			new Plugin({
				appendTransaction: (transactions, oldState, state) => {
					if (!transactions.some(tr => tr.docChanged)) return null;
					const tr = state.tr;
					let changed = false;
					state.doc.descendants((node, pos) => {
						if (node.type.name !== "paragraph") return true;
						const kids = [];
						node.forEach(c => kids.push(c));
						const hasBoard = kids.some(c => c.type.name === "chessboard");
						if (!hasBoard || kids.every(c => c.type.name === "chessboard")) return false;
						const paras = [];
						let run = [], runIsBoard = null;
						const flush = () => {
							if (run.length) paras.push(node.type.create(node.attrs, run));
							run = [];
						}
						for (const c of kids) {
							const isBoard = c.type.name === "chessboard";
							if (runIsBoard !== null && isBoard !== runIsBoard) flush();
							runIsBoard = isBoard;
							run.push(c);
						}
						flush();
						const mapped = tr.mapping.map(pos);
						tr.replaceWith(mapped, mapped + node.nodeSize, paras);
						changed = true;
						return false;
					});
					return changed ? tr : null;
				}
			}),
			// boards inside a range selection tint blue like selected text
			// (the island doesn't get the native ::selection paint), and only
			// selected boards are draggable — dragging blue content moves it,
			// exactly like dragging selected text
			new Plugin({
				view: () => ({
					update: view => {
						view.dom.querySelectorAll(".board-inline").forEach(el => {
							el.draggable = el.classList.contains("board-selected")
								&& !el.classList.contains("board-inline-editing");
						});
					}
				}),
				props: {
					decorations: state => {
						const { from, to, empty } = state.selection;
						if (empty) return null;
						const decos = [];
						state.doc.nodesBetween(from, to, (node, pos) => {
							if (node.type.name === "chessboard") {
								decos.push(Decoration.node(pos, pos + node.nodeSize, { class: "board-selected" }));
							}
						});
						return decos.length ? DecorationSet.create(state.doc, decos) : null;
					},
					// pasted boards get fresh ids, so editing state never keys
					// two boards together
					transformPasted: slice => new Slice(freshIds(slice.content), slice.openStart, slice.openEnd)
				}
			})
		]
	}
})

const freshIds = fragment => {
	const nodes = [];
	fragment.forEach(node => {
		if (node.type.name === "chessboard" && node.attrs.data) {
			nodes.push(node.type.create({ data: { ...node.attrs.data, id: crypto.randomUUID() } }));
		} else {
			nodes.push(node.copy(freshIds(node.content)));
		}
	});
	return Fragment.fromArray(nodes);
}

// insert at the caret like typing a letter; the editor opens
const insertChessboardInline = (editor, ui, boardData = null) => {
	const board = boardData ?? newBoard(startFen);
	if (!boardData) ui?.editingIds.add(board.id);
	editor.chain().focus().insertContent({ type: "chessboard", attrs: { data: board } }).run();
}

export { InlineBoardNode, insertChessboardInline }
