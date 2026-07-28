import { Node, Extension } from "@tiptap/core"
import { Plugin, Selection, TextSelection } from "@tiptap/pm/state"
import { Fragment, Slice } from "@tiptap/pm/model"
import { GapCursor } from "@tiptap/pm/gapcursor"
import { mount, unmount } from "svelte"
import ChessboardNode from "$lib/components/ChessboardNode.svelte"
import { newBoard } from "$lib/card-utils.js"

// Pure-PM chessboards (the Add cards 3 trial): each board is an atom node
// whose `data` attr holds the whole board object, grouped side by side inside
// a boardGrid node — bulletList/listItem style. PM owns order, drag and drop,
// deletion and undo; the Svelte components only render.

const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

// Interactive parts PM must leave alone: their events never reach PM
// (stopEvent) and pressing them never starts a node drag (draggable toggled
// off — a draggable ancestor would also break text selection in inputs).
const INTERACTIVE = "input, textarea, select, button, a[href]"

// No contenteditable clause: everything here sits inside the editable
// .ProseMirror root, so any closest()/ancestor check on contenteditable
// matches it and poisons every press (it killed dragging once and grid
// clicks twice) — and nothing inside the islands is contenteditable anyway
const isInteractive = target => !!target?.closest?.(INTERACTIVE)

// drag lifecycle events always go to PM — they ARE the node drag
const isDragEvent = e => e.type.startsWith("drag") || e.type === "drop"

// canDrag: the base draggability to restore on release — a blanket `true`
// would re-enable dragging on islands an open editor has turned off
const guardDraggable = (dom, canDrag = () => true) => {
	const onPress = e => {
		if (isInteractive(e.target)) dom.draggable = false;
	}
	const onRelease = () => dom.draggable = canDrag();
	dom.addEventListener("mousedown", onPress);
	dom.addEventListener("touchstart", onPress);
	window.addEventListener("mouseup", onRelease);
	window.addEventListener("touchend", onRelease);
	return () => {
		window.removeEventListener("mouseup", onRelease);
		window.removeEventListener("touchend", onRelease);
	}
}

const BoardNode = Node.create({
	name: "chessboard",
	group: "boardItem",
	atom: true,
	draggable: true,
	// boards navigate like big characters (BoardNavigation): the caret moves
	// past them, never a node selection
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
				// serialized into the DOM so drags between the front and back
				// editors (which go through HTML) carry the board along
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
		return [{ tag: "div[data-chessboard]" }]
	},

	renderHTML({ HTMLAttributes }) {
		return ["div", HTMLAttributes]
	},

	addNodeView() {
		return ({ node, editor, getPos }) => {
			const dom = document.createElement("div");
			dom.className = "board-node";
			dom.draggable = true;
			// inputs inside the island must work normally
			dom.contentEditable = "false";
			const unguard = guardDraggable(dom, () => !editing);

			// an open board editor is PM-inert: piece dragging, the palette and
			// the move list must never start a node drag or reach PM's mouse
			// handling, so the whole island stops being draggable and stopEvent
			// blankets it (its grid too — a piece drag from the board face
			// would otherwise start a native drag of the draggable grid)
			let editing = false;
			const setEditing = value => {
				editing = value;
				dom.classList.toggle("board-node-editing", value);
				dom.draggable = !value;
				const grid = dom.closest(".board-grid-node");
				if (grid) grid.draggable = !grid.querySelector(".board-node-editing");
			}

			const props = $state({
				board: node.attrs.data,
				isBack: this.options.isBack,
				ui: this.options.ui,
				// whole-object attr replacement — one undo step per board edit
				onUpdate: data => {
					const pos = getPos();
					if (pos == null) return;
					editor.view.dispatch(editor.view.state.tr.setNodeAttribute(pos, "data", data));
				},
				// v1's Duplicate: a deep copy with its own id, right after
				onDuplicate: () => {
					const pos = getPos();
					if (pos == null) return;
					const view = editor.view;
					const node = view.state.doc.nodeAt(pos);
					if (!node?.attrs.data) return;
					const copy = { ...JSON.parse(JSON.stringify(node.attrs.data)), id: crypto.randomUUID(), fenInput: undefined };
					view.dispatch(view.state.tr.insert(pos + 1, node.type.create({ data: copy })));
				},
				// an open board editor spans the grid's full row (CSS)
				onEditingChange: setEditing,
				// closing the editor (save or cancel) puts the caret after
				// the board, like finishing a letter
				onCaretAfter: () => {
					const pos = getPos();
					if (pos == null) return;
					wrapAffinity = "up";
					const view = editor.view;
					view.dispatch(view.state.tr.setSelection(new GapCursor(view.state.doc.resolve(pos + 1))));
					view.focus();
				}
			});
			const component = mount(ChessboardNode, { target: dom, props });
			// a fresh board mounts with its editor already open, before the dom
			// is in the document — re-run the guard once it can see the grid
			if (editing) queueMicrotask(() => setEditing(true));

			// caret placement on click is the node view's job: PM never sees
			// clicks here (posAtCoords is null over the non-editable island,
			// so its click pipeline — and any handleClickOn — never runs)
			// clicking a board places the caret on the side of the click,
			// like clicking a letter: left half → before, right half → after
			dom.addEventListener("click", e => {
				if (editing || isInteractive(e.target)) return;
				const pos = getPos();
				if (pos == null) return;
				const rect = dom.getBoundingClientRect();
				const after = e.clientX > rect.left + rect.width / 2;
				wrapAffinity = after ? "up" : "down";
				const view = editor.view;
				view.dispatch(view.state.tr.setSelection(new GapCursor(view.state.doc.resolve(after ? pos + 1 : pos))));
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
	}
})

const BoardGridNode = Node.create({
	name: "boardGrid",
	group: "block",
	// * not +: dragging a grid's last board out must leave a (momentarily)
	// empty grid rather than an invalid step; the plugin below removes it
	content: "boardItem*",
	draggable: true,

	parseHTML() {
		return [{ tag: "div[data-board-grid]" }]
	},

	renderHTML() {
		return ["div", { "data-board-grid": "" }, 0]
	},

	addNodeView() {
		return ({ node, editor, getPos }) => {
			const dom = document.createElement("div");
			dom.className = "board-grid-node";
			dom.draggable = true;
			const unguard = guardDraggable(dom, () => !dom.querySelector(".board-node-editing"));

			const contentDOM = document.createElement("div");
			contentDOM.className = "board-grid";
			dom.append(contentDOM);

			// a lone board centers at cell width instead of spanning the grid
			const applyCount = n => contentDOM.classList.toggle("single", n.childCount < 2);
			applyCount(node);

			// a click in the grid's empty space (the flanks beside a centered
			// board) acts like clicking the nearest board: caret on the
			// clicked side of it
			dom.addEventListener("click", e => {
				if (isInteractive(e.target) || e.target.closest(".board-node")) return;
				if (dom.querySelector(".board-node-editing")) return;
				const pos = getPos();
				if (pos == null) return;
				const view = editor.view;
				const grid = view.state.doc.nodeAt(pos);
				if (!grid) return;
				let p = pos + 1, best = null;
				grid.forEach(child => {
					const rect = view.nodeDOM(p)?.getBoundingClientRect?.();
					if (rect) {
						const cx = rect.left + rect.width / 2;
						const d = Math.hypot(e.clientX - cx, e.clientY - (rect.top + rect.height / 2));
						if (!best || d < best.d) best = { d, pos: p, after: e.clientX > cx };
					}
					p += child.nodeSize;
				});
				if (!best) return;
				wrapAffinity = best.after ? "up" : "down";
				view.dispatch(view.state.tr.setSelection(new GapCursor(view.state.doc.resolve(best.after ? best.pos + 1 : best.pos))));
				view.focus();
			});

			return {
				dom,
				contentDOM,
				update: n => {
					if (n.type.name !== "boardGrid") return false;
					applyCount(n);
					return true;
				},
				ignoreMutation: m => !contentDOM.contains(m.target) || m.target === contentDOM && m.type === "attributes",
				destroy: unguard
			}
		}
	},

	addProseMirrorPlugins() {
		return [
			// Grid normalizer: an emptied grid disappears, and grids left
			// directly adjacent (the line break between them was deleted)
			// merge into one — a grid is a paragraph of board-letters that
			// wraps visually 2 per row, not a hard line. Enter-splits never
			// re-merge: they always leave a paragraph between.
			new Plugin({
				appendTransaction: (transactions, oldState, state) => {
					if (!transactions.some(tr => tr.docChanged)) return null;
					const tr = state.tr;
					let changed = false;
					state.doc.descendants((n, pos) => {
						if (n.type.name !== "boardGrid") return true;
						if (n.childCount === 0) {
							const mapped = tr.mapping.map(pos);
							tr.delete(mapped, mapped + n.nodeSize);
							changed = true;
						}
						return false;
					});
					let boundary = 0;
					for (let i = 0; i < state.doc.childCount - 1; i++) {
						const node = state.doc.child(i);
						boundary += node.nodeSize;
						const next = state.doc.child(i + 1);
						if (isGrid(node) && node.childCount > 0 && isGrid(next) && next.childCount > 0) {
							tr.join(tr.mapping.map(boundary));
							changed = true;
						}
					}
					return changed ? tr : null;
				}
			})
		]
	}
})

// --- caret navigation: boards behave like big characters ---
// Arrows move the caret through gap positions (before/between/after boards in
// a grid), shown as a board-height blinking bar (CSS in CardSideDocEditor);
// Backspace/Delete eat a board like a letter. Up/Down pick the gap nearest
// the caret's horizontal position.

const isGrid = node => node?.type.name === "boardGrid";

// Affinity of a caret sitting on a row boundary: "down" renders it at the
// start of the lower row, "up" at the end of the upper row. Arrows toggle it
// (one position, two visual spots — like a text caret at a soft wrap).
let wrapAffinity = "down";

// a gap with boards before it where the next board starts a new row
const atRowBoundary = head => {
	const idx = head.index();
	return idx > 0 && idx % 2 === 0 && !!head.nodeAfter;
}

const setGap = (view, pos) => {
	view.dispatch(view.state.tr.setSelection(new GapCursor(view.state.doc.resolve(pos))).scrollIntoView());
	return true;
}

const setSel = (view, sel) => {
	view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
	return true;
}

// caret at the very start/end of its top-level block (each ancestor level
// contributes one boundary token, so nested list ends count too)
const atBlockEnd = $head => $head.after(1) - $head.pos === $head.depth;
const atBlockStart = $head => $head.pos - $head.before(1) === $head.depth;

// the grid gap in the given row ("first"/"last") nearest to x, for Up/Down
const rowGapNearest = (view, gridPos, grid, x, edge) => {
	const boards = [];
	let p = gridPos + 1;
	grid.forEach(child => {
		const rect = view.nodeDOM(p)?.getBoundingClientRect?.();
		if (rect) boards.push({ pos: p, end: p + child.nodeSize, rect });
		p += child.nodeSize;
	});
	if (boards.length === 0) return gridPos + 1;
	const rowTop = edge === "first"
		? Math.min(...boards.map(b => b.rect.top))
		: Math.max(...boards.map(b => b.rect.top));
	const row = boards.filter(b => Math.abs(b.rect.top - rowTop) < 2);
	const gaps = row.map(b => ({ pos: b.pos, x: b.rect.left }));
	gaps.push({ pos: row[row.length - 1].end, x: row[row.length - 1].rect.right });
	return gaps.reduce((a, b) => Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a).pos;
}

const horizontal = dir => ({ editor }) => {
	const view = editor.view;
	const { state } = view;
	const sel = state.selection;
	if (sel instanceof GapCursor && isGrid(sel.$head.parent)) {
		const head = sel.$head;
		// on a row boundary the first press only flips the visual spot (end
		// of the upper row <-> start of the lower), the next one moves
		if (atRowBoundary(head)) {
			if (dir < 0 && wrapAffinity === "down") {
				wrapAffinity = "up";
				return setGap(view, head.pos);
			}
			if (dir > 0 && wrapAffinity === "up") {
				wrapAffinity = "down";
				return setGap(view, head.pos);
			}
		}
		const neighbor = dir > 0 ? head.nodeAfter : head.nodeBefore;
		if (neighbor) {
			// moving rightward arrives at a boundary from the upper row,
			// leftward from the lower
			wrapAffinity = dir > 0 ? "up" : "down";
			return setGap(view, head.pos + dir * neighbor.nodeSize);
		}
		const exit = state.doc.resolve(dir > 0 ? head.after() : head.before());
		// at the document's edge the caret stays put, like text at its end
		if (dir > 0 ? !exit.nodeAfter : !exit.nodeBefore) return true;
		return setSel(view, Selection.near(exit, dir));
	}
	if (sel.empty && sel instanceof TextSelection) {
		const head = sel.$head;
		if (dir > 0 ? !atBlockEnd(head) : !atBlockStart(head)) return false;
		const neighbor = state.doc.maybeChild(head.index(0) + dir);
		if (!isGrid(neighbor)) return false;
		return setGap(view, dir > 0 ? head.after(1) + 1 : head.before(1) - 1);
	}
	return false;
}

const vertical = dir => ({ editor }) => {
	const view = editor.view;
	const { state } = view;
	const sel = state.selection;
	if (sel instanceof GapCursor && isGrid(sel.$head.parent)) {
		// leave the grid toward the text above/below, keeping the caret's x
		const head = sel.$head;
		// on the document's first/last line, up/down go to the line's edge
		// gap instead of leaving — like text carets on their last line
		const edge = state.doc.resolve(dir > 0 ? head.after() : head.before());
		if (dir > 0 ? !edge.nodeAfter : !edge.nodeBefore) {
			return setGap(view, dir > 0 ? head.after() - 1 : head.before() + 1);
		}
		const side = head.nodeAfter ?? head.nodeBefore;
		const sideRect = side
			&& view.nodeDOM(head.nodeAfter ? head.pos : head.pos - side.nodeSize)?.getBoundingClientRect?.();
		const x = sideRect ? (head.nodeAfter ? sideRect.left : sideRect.right) : 0;
		const gridRect = view.nodeDOM(head.before())?.getBoundingClientRect?.();
		if (gridRect) {
			const found = view.posAtCoords({
				left: x,
				top: dir > 0 ? gridRect.bottom + 8 : gridRect.top - 8
			});
			if (found) return setSel(view, Selection.near(state.doc.resolve(found.pos), dir));
		}
		return setSel(view, Selection.near(state.doc.resolve(dir > 0 ? head.after() : head.before()), dir));
	}
	if (sel.empty && sel instanceof TextSelection) {
		// only from the block's last/first visual line — inner lines keep the
		// native caret movement
		if (!view.endOfTextblock(dir > 0 ? "down" : "up")) return false;
		const head = sel.$head;
		const neighbor = state.doc.maybeChild(head.index(0) + dir);
		if (!isGrid(neighbor)) return false;
		const gridPos = dir > 0 ? head.after(1) : head.before(1) - neighbor.nodeSize;
		const x = view.coordsAtPos(head.pos).left;
		// entering from above may land on a boundary at the first row's end
		// (show it there); from below on the last row's start
		wrapAffinity = dir > 0 ? "up" : "down";
		return setGap(view, rowGapNearest(view, gridPos, neighbor, x, dir > 0 ? "first" : "last"));
	}
	return false;
}

// Deletes one board at a gap. A line's only board leaves an empty line behind
// (like deleting the only letter on a line — the line itself stays, and the
// next press removes it); otherwise the caret stays at the deletion point.
const deleteGapBoard = (view, from, node) => {
	const state = view.state;
	const resolved = state.doc.resolve(from);
	if (resolved.parent.childCount === 1) {
		const gridPos = resolved.before();
		const tr = state.tr.replaceWith(gridPos, gridPos + resolved.parent.nodeSize, state.schema.nodes.paragraph.create());
		tr.setSelection(TextSelection.create(tr.doc, gridPos + 1)).scrollIntoView();
		view.dispatch(tr);
		return;
	}
	wrapAffinity = "up";
	const tr = state.tr.delete(from, from + node.nodeSize);
	tr.setSelection(new GapCursor(tr.doc.resolve(from))).scrollIntoView();
	view.dispatch(tr);
}

const removeBoard = dir => ({ editor }) => {
	const view = editor.view;
	const { state } = view;
	const sel = state.selection;
	if (sel instanceof GapCursor && isGrid(sel.$head.parent)) {
		const head = sel.$head;
		const target = dir > 0 ? head.nodeAfter : head.nodeBefore;
		if (!target) {
			const edge = state.doc.resolve(dir > 0 ? head.after() : head.before());
			const neighbor = dir > 0 ? edge.nodeAfter : edge.nodeBefore;
			// an empty line beside the boards joins away (the boards move
			// up/down) — plain backspace/delete line-join behaviour
			if (neighbor?.isTextblock && neighbor.content.size === 0) {
				const from = dir > 0 ? edge.pos : edge.pos - neighbor.nodeSize;
				const tr = state.tr.delete(from, from + neighbor.nodeSize);
				tr.setSelection(new GapCursor(tr.doc.resolve(dir > 0 ? head.pos : head.pos - neighbor.nodeSize))).scrollIntoView();
				view.dispatch(tr);
				return true;
			}
			// nothing joinable: at the document's edge stay put, otherwise
			// the caret moves into the neighboring line
			if (!neighbor) return true;
			return setSel(view, Selection.near(edge, dir));
		}
		deleteGapBoard(view, dir > 0 ? head.pos : head.pos - target.nodeSize, target);
		return true;
	}
	if (sel.empty && sel instanceof TextSelection) {
		const head = sel.$head;
		if (dir > 0 ? !atBlockEnd(head) : !atBlockStart(head)) return false;
		const neighbor = state.doc.maybeChild(head.index(0) + dir);
		if (!isGrid(neighbor)) return false;
		const block = state.doc.child(head.index(0));
		// an empty line beside a board line deletes like any empty line: it
		// goes and the caret lands beside the boards (grids left adjacent
		// then merge — the normalizer)
		if (block.isTextblock && block.content.size === 0) {
			const from = head.before(1);
			const tr = state.tr.delete(from, head.after(1));
			tr.setSelection(new GapCursor(tr.doc.resolve(dir > 0 ? from + 1 : from - 1))).scrollIntoView();
			view.dispatch(tr);
			return true;
		}
		// a non-empty line can't join into boards: the caret just moves
		// beside them, the next press deletes
		return setGap(view, dir > 0 ? head.after(1) + 1 : head.before(1) - 1);
	}
	return false;
}

// Home/End at a board gap jump to the line's edges, like in text
const lineEdge = dir => ({ editor }) => {
	const view = editor.view;
	const sel = view.state.selection;
	if (!(sel instanceof GapCursor) || !isGrid(sel.$head.parent)) return false;
	const head = sel.$head;
	return setGap(view, dir > 0 ? head.after() - 1 : head.before() + 1);
}

// Enter at a board gap behaves like a line break in text: at the line's start
// an empty line opens above (the caret stays with the boards), at the end a
// new line opens below (the caret moves onto it), and mid-line the boards
// split around a new empty line
const enterFromGap = ({ editor }) => {
	const view = editor.view;
	const { state } = view;
	const sel = state.selection;
	if (!(sel instanceof GapCursor) || !isGrid(sel.$head.parent)) return false;
	const head = sel.$head;
	const paragraph = state.schema.nodes.paragraph.create();
	if (!head.nodeBefore) {
		const tr = state.tr.insert(head.before(), paragraph);
		tr.setSelection(new GapCursor(tr.doc.resolve(head.pos + paragraph.nodeSize))).scrollIntoView();
		view.dispatch(tr);
		return true;
	}
	if (!head.nodeAfter) {
		const after = head.after();
		const tr = state.tr.insert(after, paragraph);
		tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView();
		view.dispatch(tr);
		return true;
	}
	const tr = state.tr.split(head.pos);
	const between = head.pos + 1;
	tr.insert(between, paragraph);
	tr.setSelection(TextSelection.create(tr.doc, between + 1)).scrollIntoView();
	view.dispatch(tr);
	return true;
}

// Single-board clipboard: at a board gap, ctrl-c/x take the board beside the
// caret (before it, like the letter just passed) and ctrl-v puts a copy back
// at the caret. Regular text copy/paste is untouched — the handlers only
// claim gap cursors. Module-wide, so it works across the front and back
// editors. Range selections spanning boards use the native clipboard instead
// (the nodes serialize through their DOM attrs).
let boardClipboard = null;

const gapBoard = sel => {
	if (!(sel instanceof GapCursor) || !isGrid(sel.$head.parent)) return null;
	const head = sel.$head;
	const node = head.nodeBefore ?? head.nodeAfter;
	if (!node) return null;
	return { node, from: head.nodeBefore ? head.pos - node.nodeSize : head.pos };
}

const copyBoard = cut => ({ editor }) => {
	const view = editor.view;
	const found = gapBoard(view.state.selection);
	if (!found) return false;
	boardClipboard = JSON.parse(JSON.stringify(found.node.attrs.data));
	if (cut) deleteGapBoard(view, found.from, found.node);
	return true;
}

const pasteBoard = ({ editor }) => {
	const sel = editor.state.selection;
	if (!boardClipboard || !(sel instanceof GapCursor) || !isGrid(sel.$head.parent)) return false;
	insertChessboard(editor, null, { ...JSON.parse(JSON.stringify(boardClipboard)), id: crypto.randomUUID() });
	return true;
}

// pasted boards get fresh ids, so editing state never keys two boards together
const withFreshIds = fragment => {
	const nodes = [];
	fragment.forEach(node => {
		if (node.type.name === "chessboard" && node.attrs.data) {
			nodes.push(node.type.create({ data: { ...node.attrs.data, id: crypto.randomUUID() } }));
		} else {
			nodes.push(node.copy(withFreshIds(node.content)));
		}
	});
	return Fragment.fromArray(nodes);
}

const BoardNavigation = Extension.create({
	name: "boardNavigation",
	// above Gapcursor's keymap, which otherwise consumes the arrow keys first
	priority: 1000,

	addKeyboardShortcuts() {
		return {
			ArrowRight: horizontal(1),
			ArrowLeft: horizontal(-1),
			ArrowDown: vertical(1),
			ArrowUp: vertical(-1),
			Backspace: removeBoard(-1),
			Delete: removeBoard(1),
			Enter: enterFromGap,
			Home: lineEdge(-1),
			End: lineEdge(1),
			"Mod-c": copyBoard(false),
			"Mod-x": copyBoard(true),
			"Mod-v": pasteBoard
		}
	},

	addProseMirrorPlugins() {
		return [
			// One gap position at a row boundary has two visual spots: end of
			// the upper row or start of the lower. Which one shows is the
			// caret's affinity (wrapAffinity), toggled by the arrows like a
			// text caret at a soft wrap. Rows are 2 wide, so "boards before
			// the gap is even" marks a row-start position.
			new Plugin({
				view: () => ({
					update: view => {
						const gc = view.dom.querySelector(".board-grid > .ProseMirror-gapcursor");
						if (!gc) return;
						let before = 0;
						for (let el = gc.previousElementSibling; el; el = el.previousElementSibling) {
							if (el.classList.contains("board-node")) before++;
						}
						const lineStart = !!gc.nextElementSibling
							&& (before === 0 || (before % 2 === 0 && wrapAffinity === "down"));
						gc.classList.toggle("caret-line-start", lineStart);
					}
				})
			}),
			new Plugin({
				props: {
					transformPasted: slice => new Slice(withFreshIds(slice.content), slice.openStart, slice.openEnd),
					// typing at a board gap makes the line a keystroke would
					// have made (Enter semantics) and puts the character in it
					handleTextInput: (view, from, to, text) => {
						const sel = view.state.selection;
						if (!(sel instanceof GapCursor) || !isGrid(sel.$head.parent)) return false;
						const head = sel.$head;
						const schema = view.state.schema;
						const paragraph = schema.nodes.paragraph.create(null, schema.text(text));
						const tr = view.state.tr;
						let caret;
						if (!head.nodeBefore) {
							tr.insert(head.before(), paragraph);
							caret = head.before() + 1 + text.length;
						} else if (!head.nodeAfter) {
							tr.insert(head.after(), paragraph);
							caret = head.after() + 1 + text.length;
						} else {
							tr.split(head.pos);
							tr.insert(head.pos + 1, paragraph);
							caret = head.pos + 2 + text.length;
						}
						tr.setSelection(TextSelection.create(tr.doc, caret)).scrollIntoView();
						view.dispatch(tr);
						return true;
					}
				}
			})
		]
	}
})

// The toolbar's only insert action: a new board joins the grid the selection
// touches (a selected board/grid, or one adjacent to the cursor's block);
// otherwise a fresh grid goes in after the cursor's block. Its editor opens,
// and the caret lands after it like a typed letter (also keeps the mapped
// selection from painting a stray highlight across the island).
const insertChessboard = (editor, ui, boardData = null) => {
	const board = boardData ?? newBoard(startFen);
	if (!boardData) ui?.editingIds.add(board.id);
	const { state } = editor;
	const { doc, selection, schema } = state;
	const boardNode = schema.nodes.chessboard.create({ data: board });
	const tr = state.tr;

	// a caret sitting in a grid (gap cursor) inserts right there
	if (selection instanceof GapCursor && isGrid(selection.$head.parent)) {
		const at = selection.head;
		tr.insert(at, boardNode);
		tr.setSelection(new GapCursor(tr.doc.resolve(at + 1)));
		tr.scrollIntoView();
		editor.view.dispatch(tr);
		return;
	}

	const selName = selection.node?.type.name;
	const from = selection.$from;
	const index = from.index(0);
	const child = i => i >= 0 && i < doc.childCount ? doc.child(i) : null;
	const posOf = i => from.posAtIndex(i, 0);
	const endInside = i => posOf(i) + child(i).nodeSize - 1;

	let boardPos;
	if (selName === "chessboard") {
		boardPos = selection.to;
	} else if (selName === "boardGrid") {
		boardPos = selection.to - 1;
	} else if (child(index)?.type.name === "boardGrid") {
		// gap cursor against the grid
		boardPos = endInside(index);
	} else if (child(index - 1)?.type.name === "boardGrid") {
		boardPos = endInside(index - 1);
	} else if (child(index + 1)?.type.name === "boardGrid") {
		boardPos = posOf(index + 1) + 1;
	} else {
		const grid = schema.nodes.boardGrid.create(null, [boardNode]);
		const cur = child(index);
		if (cur?.isTextblock && cur.content.size === 0) {
			// a board line replaces the empty line the caret is on — no
			// leftover blank paragraph above the grid
			tr.replaceWith(posOf(index), posOf(index) + cur.nodeSize, grid);
			boardPos = posOf(index) + 1;
		} else {
			const at = posOf(index) + (cur?.nodeSize ?? 0);
			tr.insert(at, grid);
			boardPos = at + 1;
		}
		tr.setSelection(new GapCursor(tr.doc.resolve(boardPos + 1)));
		tr.scrollIntoView();
		editor.view.dispatch(tr);
		return;
	}
	tr.insert(boardPos, boardNode);
	tr.setSelection(new GapCursor(tr.doc.resolve(boardPos + 1)));
	tr.scrollIntoView();
	editor.view.dispatch(tr);
}

export { BoardNode, BoardGridNode, BoardNavigation, insertChessboard, startFen, isInteractive, isDragEvent, guardDraggable }
