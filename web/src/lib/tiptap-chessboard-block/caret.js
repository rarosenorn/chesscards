import { Extension } from "@tiptap/core"
import { Plugin, Selection, TextSelection } from "@tiptap/pm/state"
import { Slice } from "@tiptap/pm/model"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { GapCursor } from "@tiptap/pm/gapcursor"
import { boardCaret, caretRange, setBoardCaret, clearBoardCaret, boardClipboard } from "$lib/block-caret-state.svelte.js"
import { isBlock, withFreshIds } from "./node.svelte.js"
import { nearestGapAtEdge, gapScreenX, cellRows, blockCells } from "./geometry.js"

// The virtual board caret: PM sees one atom node per chessboard block, and
// the per-board "letters" feel is simulated here. PM keeps focus and its
// (hidden, parked) text selection; while boardCaret is active these handlers
// drive per-board behavior against the block's attrs.
//
// Board deletions always go through removeBoards, which cleans the shared
// editing ui state and lets an emptied block dissolve into an empty line.
// Blocks may sit at the document's very start or end — every edge handler
// copes with a missing neighbor line (typing at an edge gap creates one).

export const findBlock = state => {
	if (boardCaret.blockId == null) return null;
	let found = null;
	state.doc.descendants((n, pos) => {
		if (found || !isBlock(n)) return !found;
		if (n.attrs.id === boardCaret.blockId) found = { node: n, pos };
		return false;
	});
	return found;
}

export const boardsOf = block => block.node.attrs.boards ?? [];

export const virtualActive = state => boardCaret.blockId != null && findBlock(state) != null;

export const setBoards = (view, block, boards) =>
	view.dispatch(view.state.tr.setNodeAttribute(block.pos, "boards", boards));

// caret at the very end/start of the top-level textblock it sits in
const atCaretBlockEnd = head => head.after(1) - head.pos === head.depth;
const atCaretBlockStart = head => head.pos - head.before(1) === head.depth;

// The block's caret stops in VISUAL order — an open editor reorders its row
// (editor on top), so index order and screen order can differ. Each visual
// row starts with a "down" stop (before its first cell) and every cell ends
// with an "up" stop; a same-row middle gap is a single stop. Horizontal
// navigation walks this list, so the caret always moves the way the screen
// reads, whatever the layout.
const visualStops = blockId => {
	const rows = cellRows(blockCells(blockId));
	const stops = [];
	for (const row of rows) {
		stops.push({ index: row.cells[0].index, affinity: "down" });
		for (const c of row.cells) stops.push({ index: c.index + 1, affinity: "up" });
	}
	return stops;
}

const stopAt = (stops, index, affinity) => {
	const exact = stops.findIndex(s => s.index === index && s.affinity === affinity);
	return exact >= 0 ? exact : stops.findIndex(s => s.index === index);
}

const enterBlock = (id, count, dir) => {
	const stops = visualStops(id);
	if (stops.length) {
		const s = dir > 0 ? stops[0] : stops[stops.length - 1];
		setBoardCaret(id, s.index, s.affinity);
	} else {
		setBoardCaret(id, dir > 0 ? 0 : count, dir > 0 ? "down" : "up");
	}
}

// the host editor wires this so board deletions clean the shared editing
// state (open editors, persisted editor state)
let blockUiCleanup = null;
export const configureBlockUiCleanup = fn => blockUiCleanup = fn;

// Remove boards [from, to) from a block. caret places the virtual caret at
// that gap afterwards; "keep" leaves the selection alone (deleting from the
// text beside the block — the caret stays in the text). An emptied block
// dissolves into an empty line, like a text line whose letters ran out.
const removeBoards = (view, block, from, to, caret) => {
	const boards = boardsOf(block);
	for (const b of boards.slice(from, to)) blockUiCleanup?.(b.id);
	const remaining = [...boards.slice(0, from), ...boards.slice(to)];
	if (caret === "keep") {
		// an emptied block dissolves via the normalizer, selection untouched
		view.dispatch(view.state.tr.setNodeAttribute(block.pos, "boards", remaining).scrollIntoView());
		return;
	}
	if (remaining.length === 0) {
		const tr = view.state.tr.replaceWith(block.pos, block.pos + block.node.nodeSize, view.state.schema.nodes.paragraph.create());
		tr.setSelection(TextSelection.create(tr.doc, block.pos + 1)).scrollIntoView();
		clearBoardCaret();
		view.dispatch(tr);
		return;
	}
	boardCaret.index = caret;
	boardCaret.anchor = null;
	boardCaret.affinity = "up";
	setBoards(view, block, remaining);
}

// a collapsed parking spot at pos: a gap cursor beside a block when valid,
// else the nearest text position — never a remapped selection, which can
// stretch across a block (tinting it) or degrade to an all-selection
const parkedSelectionAt = (doc, pos, dir) => {
	const $pos = doc.resolve(pos);
	if (GapCursor.valid?.($pos)) return new GapCursor($pos);
	return Selection.near($pos, dir);
}

// Insert a block carrying boards at the selection's line: replacing an empty
// line, or after the current one; the real selection parks collapsed beside
// it and the virtual caret lands after the boards.
export const insertBlockWithBoards = (view, boards) => {
	const state = view.state;
	const { doc, selection, schema } = state;
	const blockNode = schema.nodes.chessboardBlock.create({ id: crypto.randomUUID(), boards });
	const tr = state.tr;

	let blockPos;
	if (selection instanceof GapCursor && selection.$head.depth === 0) {
		blockPos = selection.head;
		tr.insert(blockPos, blockNode);
	} else {
		const from = selection.$from;
		const index = from.index(0);
		const cur = index < doc.childCount ? doc.child(index) : null;
		if (cur?.isTextblock && cur.content.size === 0) {
			blockPos = from.posAtIndex(index, 0);
			tr.replaceWith(blockPos, blockPos + cur.nodeSize, blockNode);
		} else {
			blockPos = from.posAtIndex(index, 0) + (cur?.nodeSize ?? 0);
			tr.insert(blockPos, blockNode);
		}
	}
	// park the real selection collapsed beside the block — the mapped
	// selection can otherwise span the insert and paint it as a range
	tr.setSelection(new GapCursor(tr.doc.resolve(blockPos + blockNode.nodeSize)));
	tr.scrollIntoView();
	view.dispatch(tr);
	setBoardCaret(blockNode.attrs.id, boards.length, "up");
	view.focus();
	return blockNode;
}

// split the block at gap, an empty (or text-carrying) line between the halves
const splitBlockAt = (view, block, gap, text = null) => {
	const { state } = view;
	const schema = state.schema;
	const boards = boardsOf(block);
	const para = text
		? schema.nodes.paragraph.create(null, schema.text(text))
		: schema.nodes.paragraph.create();
	const parts = [];
	if (gap > 0) parts.push(schema.nodes.chessboardBlock.create({ id: block.node.attrs.id, boards: boards.slice(0, gap) }));
	parts.push(para);
	if (gap < boards.length) parts.push(schema.nodes.chessboardBlock.create({ id: crypto.randomUUID(), boards: boards.slice(gap) }));
	const tr = state.tr.replaceWith(block.pos, block.pos + block.node.nodeSize, parts);
	const paraPos = block.pos + (gap > 0 ? parts[0].nodeSize : 0);
	tr.setSelection(TextSelection.create(tr.doc, paraPos + 1 + (text?.length ?? 0))).scrollIntoView();
	clearBoardCaret();
	view.dispatch(tr);
	view.focus();
}

// --- keyboard handlers ---

const vHorizontal = dir => ({ editor }) => {
	const view = editor.view;
	const state = view.state;
	if (virtualActive(state)) {
		const block = findBlock(state);
		const count = boardsOf(block).length;
		// an active range collapses to its edge, like a text selection
		const range = caretRange();
		if (range) {
			boardCaret.index = dir > 0 ? range.to : range.from;
			boardCaret.anchor = null;
			boardCaret.affinity = dir > 0 ? "up" : "down";
			return true;
		}
		boardCaret.anchor = null;
		// walk the visual stop list — screen order, not index order
		const stops = visualStops(boardCaret.blockId);
		const cur = stopAt(stops, boardCaret.index, boardCaret.affinity);
		const next = cur + dir;
		if (cur >= 0 && next >= 0 && next < stops.length) {
			boardCaret.index = stops[next].index;
			boardCaret.affinity = stops[next].affinity;
			return true;
		}
		// leave: flow straight into an adjacent block, land in adjacent
		// text, or stay put at the document's edge
		const edgeRes = state.doc.resolve(dir > 0 ? block.pos + block.node.nodeSize : block.pos);
		const neighborNode = dir > 0 ? edgeRes.nodeAfter : edgeRes.nodeBefore;
		if (isBlock(neighborNode)) {
			enterBlock(neighborNode.attrs.id, (neighborNode.attrs.boards ?? []).length, dir);
			return true;
		}
		if (!neighborNode) return true;
		clearBoardCaret();
		view.dispatch(state.tr.setSelection(Selection.near(edgeRes, dir)).scrollIntoView());
		return true;
	}
	// enter a neighboring block from text
	const sel = state.selection;
	if (!(sel instanceof TextSelection) || !sel.empty) return false;
	const head = sel.$head;
	if (dir > 0 ? !atCaretBlockEnd(head) : !atCaretBlockStart(head)) return false;
	const neighbor = state.doc.maybeChild(head.index(0) + dir);
	if (!isBlock(neighbor)) return false;
	enterBlock(neighbor.attrs.id, (neighbor.attrs.boards ?? []).length, dir);
	return true;
}

const vVertical = dir => ({ editor }) => {
	const view = editor.view;
	const state = view.state;
	if (virtualActive(state)) {
		const block = findBlock(state);
		boardCaret.anchor = null;
		const x = gapScreenX(boardCaret.blockId, boardCaret.index, boardCaret.affinity);
		const edgeRes = state.doc.resolve(dir > 0 ? block.pos + block.node.nodeSize : block.pos);
		const neighborNode = dir > 0 ? edgeRes.nodeAfter : edgeRes.nodeBefore;
		if (isBlock(neighborNode)) {
			const index = nearestGapAtEdge(neighborNode.attrs.id, x, dir > 0 ? "first" : "last");
			setBoardCaret(neighborNode.attrs.id, index, dir > 0 ? "up" : "down");
			return true;
		}
		if (!neighborNode) return true;
		const el = document.querySelector(`.board-block[data-block-id="${boardCaret.blockId}"]`);
		const rect = el?.getBoundingClientRect();
		clearBoardCaret();
		let selTarget = null;
		if (rect) {
			const found = view.posAtCoords({ left: x, top: dir > 0 ? rect.bottom + 8 : rect.top - 8 });
			if (found) selTarget = Selection.near(state.doc.resolve(found.pos), dir);
		}
		if (!selTarget) selTarget = Selection.near(edgeRes, dir);
		view.dispatch(state.tr.setSelection(selTarget).scrollIntoView());
		return true;
	}
	const sel = state.selection;
	if (!(sel instanceof TextSelection) || !sel.empty) return false;
	if (!view.endOfTextblock(dir > 0 ? "down" : "up")) return false;
	const head = sel.$head;
	const neighbor = state.doc.maybeChild(head.index(0) + dir);
	if (!isBlock(neighbor)) return false;
	const x = view.coordsAtPos(head.pos).left;
	const index = nearestGapAtEdge(neighbor.attrs.id, x, dir > 0 ? "first" : "last");
	setBoardCaret(neighbor.attrs.id, index, dir > 0 ? "up" : "down");
	return true;
}

const vShift = dir => ({ editor }) => {
	const state = editor.view.state;
	if (!virtualActive(state)) return false;
	const block = findBlock(state);
	const count = boardsOf(block).length;
	if (boardCaret.anchor == null) boardCaret.anchor = boardCaret.index;
	const next = boardCaret.index + dir;
	if (next < 0 || next > count) return true;
	boardCaret.index = next;
	if (boardCaret.anchor === boardCaret.index) boardCaret.anchor = null;
	return true;
}

const vEdge = dir => ({ editor }) => {
	const state = editor.view.state;
	if (!virtualActive(state)) return false;
	const block = findBlock(state);
	boardCaret.anchor = null;
	const stops = visualStops(boardCaret.blockId);
	if (stops.length) {
		const s = dir > 0 ? stops[stops.length - 1] : stops[0];
		boardCaret.index = s.index;
		boardCaret.affinity = s.affinity;
	} else {
		boardCaret.index = dir > 0 ? boardsOf(block).length : 0;
		boardCaret.affinity = dir > 0 ? "up" : "down";
	}
	return true;
}

// Backspace/Delete from the text beside a block. PM's default join would
// swallow the whole block node (every board at once); instead an empty line
// joins away with the caret flowing into the block (text semantics), and a
// non-empty line takes just the block's nearest board.
const textEdgeRemove = (view, state, dir) => {
	const sel = state.selection;
	if (!(sel instanceof TextSelection) || !sel.empty) return false;
	const head = sel.$head;
	// top-level paragraphs only — list Backspace/Delete keeps its own rules
	if (head.depth !== 1) return false;
	if (dir > 0 ? !atCaretBlockEnd(head) : !atCaretBlockStart(head)) return false;
	const neighbor = state.doc.maybeChild(head.index(0) + dir);
	if (!isBlock(neighbor)) {
		// At the document's edge with a block on the caret's other side the
		// key must still be consumed: PM's join commands all fail there and
		// the browser's NATIVE delete takes over — which selects the whole
		// non-editable island. Deleting into the doc edge is a no-op.
		const behind = state.doc.maybeChild(head.index(0) - dir);
		return neighbor == null && isBlock(behind);
	}
	const boards = neighbor.attrs.boards ?? [];
	if (head.parent.content.size === 0) {
		const from = head.before(1);
		const tr = state.tr.delete(from, from + head.parent.nodeSize);
		// the selection sat inside the deleted line; remapping it could
		// stretch it across the block and tint everything — park it collapsed
		tr.setSelection(parkedSelectionAt(tr.doc, from, dir));
		tr.setMeta("boardCaretKeep", true);
		// caret set BEFORE dispatch: deleting the line may leave two blocks
		// adjacent — the normalizer merges them and remaps the caret along
		enterBlock(neighbor.attrs.id, boards.length, dir);
		view.dispatch(tr.scrollIntoView());
		return true;
	}
	if (boards.length === 0) return true;
	const index = dir > 0 ? 0 : boards.length - 1;
	const pos = dir > 0 ? head.after(1) : head.before(1) - neighbor.nodeSize;
	removeBoards(view, { node: neighbor, pos }, index, index + 1, "keep");
	return true;
}

const vRemove = dir => ({ editor }) => {
	const view = editor.view;
	const state = view.state;
	if (!virtualActive(state)) return textEdgeRemove(view, state, dir);
	const block = findBlock(state);
	const count = boardsOf(block).length;
	const range = caretRange();
	if (range) {
		removeBoards(view, block, range.from, range.to, range.from);
		return true;
	}
	const i = boardCaret.index;
	const target = dir > 0 ? (i < count ? i : null) : (i > 0 ? i - 1 : null);
	if (target == null) {
		// at the block's edge: an empty neighboring line joins away; boards
		// beyond flow the caret through; text takes it
		const edgeRes = state.doc.resolve(dir > 0 ? block.pos + block.node.nodeSize : block.pos);
		const neighborNode = dir > 0 ? edgeRes.nodeAfter : edgeRes.nodeBefore;
		if (neighborNode?.isTextblock && neighborNode.content.size === 0) {
			const from = dir > 0 ? edgeRes.pos : edgeRes.pos - neighborNode.nodeSize;
			const tr = state.tr.delete(from, from + neighborNode.nodeSize);
			// the parked selection may sit inside the deleted line; remapping
			// could stretch it across the block and tint it — repark it
			// collapsed (the meta keeps the active virtual caret alive)
			tr.setSelection(parkedSelectionAt(tr.doc, from, dir));
			tr.setMeta("boardCaretKeep", true);
			view.dispatch(tr.scrollIntoView());
			return true;
		}
		if (isBlock(neighborNode)) {
			enterBlock(neighborNode.attrs.id, (neighborNode.attrs.boards ?? []).length, dir);
			return true;
		}
		if (!neighborNode) return true;
		clearBoardCaret();
		view.dispatch(state.tr.setSelection(Selection.near(edgeRes, dir)).scrollIntoView());
		return true;
	}
	removeBoards(view, block, target, target + 1, target);
	return true;
}

const vEnter = ({ editor }) => {
	const view = editor.view;
	const state = view.state;
	if (!virtualActive(state)) return false;
	const block = findBlock(state);
	if (boardCaret.index === 0) {
		// before the first board a fresh line pushes in above and the caret
		// stays put — Enter at the start of a text line
		view.dispatch(state.tr.insert(block.pos, state.schema.nodes.paragraph.create()).scrollIntoView());
		return true;
	}
	splitBlockAt(view, block, boardCaret.index);
	return true;
}

const vCopy = cut => ({ editor }) => {
	const view = editor.view;
	const state = view.state;
	if (!virtualActive(state)) return false;
	const block = findBlock(state);
	const boards = boardsOf(block);
	const range = caretRange();
	const from = range ? range.from : boardCaret.index > 0 ? boardCaret.index - 1 : boardCaret.index < boards.length ? boardCaret.index : null;
	if (from == null) return true;
	const to = range ? range.to : from + 1;
	boardClipboard.boards = JSON.parse(JSON.stringify(boards.slice(from, to)));
	if (cut) removeBoards(view, block, from, to, from);
	return true;
}

// boards pasted onto a block edge join it, with the caret after the paste
const joinPaste = (view, node, pos, at, boards) => {
	const existing = node.attrs.boards ?? [];
	const next = at === "end" ? [...existing, ...boards] : [...boards, ...existing];
	view.dispatch(view.state.tr.setNodeAttribute(pos, "boards", next).scrollIntoView());
	setBoardCaret(node.attrs.id, at === "end" ? next.length : boards.length, "up");
	view.focus();
	return true;
}

// Paste boards: at a virtual gap they go into that block; in text they join
// a block touching the caret (nothing but the line boundary between them),
// or otherwise become a new block at the caret's line.
const vPaste = ({ editor }) => {
	const view = editor.view;
	const state = view.state;
	if (!boardClipboard.boards?.length) return false;
	const fresh = boardClipboard.boards.map(b => ({ ...JSON.parse(JSON.stringify(b)), id: crypto.randomUUID() }));
	if (virtualActive(state)) {
		const block = findBlock(state);
		const boards = boardsOf(block);
		const range = caretRange();
		if (range) for (const b of boards.slice(range.from, range.to)) blockUiCleanup?.(b.id);
		const i = range ? range.from : boardCaret.index;
		const base = range ? [...boards.slice(0, range.from), ...boards.slice(range.to)] : boards;
		const next = [...base.slice(0, i), ...fresh, ...base.slice(i)];
		boardCaret.index = i + fresh.length;
		boardCaret.anchor = null;
		setBoards(view, block, next);
		return true;
	}
	const sel = state.selection;
	if (sel instanceof GapCursor && sel.$head.depth === 0) {
		const prev = sel.$head.nodeBefore;
		const next = sel.$head.nodeAfter;
		if (isBlock(prev)) return joinPaste(view, prev, sel.head - prev.nodeSize, "end", fresh);
		if (isBlock(next)) return joinPaste(view, next, sel.head, "start", fresh);
		insertBlockWithBoards(view, fresh);
		view.focus();
		return true;
	}
	if (sel instanceof TextSelection && sel.empty && sel.$head.depth === 1) {
		const head = sel.$head;
		const prev = head.index(0) > 0 ? state.doc.child(head.index(0) - 1) : null;
		const next = state.doc.maybeChild(head.index(0) + 1);
		if (head.parentOffset === 0 && isBlock(prev)) return joinPaste(view, prev, head.before(1) - prev.nodeSize, "end", fresh);
		if (head.parentOffset === head.parent.content.size && isBlock(next)) return joinPaste(view, next, head.after(1), "start", fresh);
		insertBlockWithBoards(view, fresh);
		view.focus();
		return true;
	}
	return false;
}

export const BlockNavigation = Extension.create({
	name: "blockNavigation",
	// above the default keymaps
	priority: 1000,

	addKeyboardShortcuts() {
		return {
			ArrowRight: vHorizontal(1),
			ArrowLeft: vHorizontal(-1),
			ArrowDown: vVertical(1),
			ArrowUp: vVertical(-1),
			"Shift-ArrowRight": vShift(1),
			"Shift-ArrowLeft": vShift(-1),
			Home: vEdge(-1),
			End: vEdge(1),
			Backspace: vRemove(-1),
			Delete: vRemove(1),
			Enter: vEnter,
			"Mod-c": vCopy(false),
			"Mod-x": vCopy(true),
			"Mod-v": vPaste
		}
	},

	addProseMirrorPlugins() {
		return [
			// typing at a virtual gap makes the line a keystroke would have
			// made: above at block start, below at end, splitting between
			new Plugin({
				props: {
					// pressing anywhere in the document outside a board island
					// dismisses the virtual caret. The selection-transaction
					// rule below can't cover this: the parked selection may
					// already sit where the user clicks, so no transaction
					// fires — and the text caret stays hidden while the
					// virtual one is considered active
					handleDOMEvents: {
						mousedown: (view, event) => {
							if (boardCaret.blockId != null && !event.target?.closest?.(".board-block")) clearBoardCaret();
							return false;
						}
					},
					handleKeyDown: (view, event) => {
						if (boardCaret.blockId == null) return false;
						if (event.ctrlKey || event.metaKey || event.altKey) return false;
						if (event.key.length !== 1) return false;
						const block = findBlock(view.state);
						if (!block) return false;
						const gap = boardCaret.index;
						const count = boardsOf(block).length;
						if (gap === 0) {
							const tr = view.state.tr.insert(block.pos, view.state.schema.nodes.paragraph.create(null, view.state.schema.text(event.key)));
							tr.setSelection(TextSelection.create(tr.doc, block.pos + 1 + event.key.length)).scrollIntoView();
							clearBoardCaret();
							view.dispatch(tr);
						} else if (gap === count) {
							const after = block.pos + block.node.nodeSize;
							const tr = view.state.tr.insert(after, view.state.schema.nodes.paragraph.create(null, view.state.schema.text(event.key)));
							tr.setSelection(TextSelection.create(tr.doc, after + 1 + event.key.length)).scrollIntoView();
							clearBoardCaret();
							view.dispatch(tr);
						} else {
							splitBlockAt(view, block, gap, event.key);
						}
						event.preventDefault();
						return true;
					}
				},
				// a transaction that really SETS the selection (click into text,
				// undo restoring one) dismisses the virtual caret; a parked
				// selection merely remapped through a doc change does not, and
				// neither does our own explicit reparking (boardCaretKeep)
				appendTransaction: transactions => {
					if (boardCaret.blockId == null) return null;
					if (transactions.some(tr => tr.selectionSet && !tr.getMeta("boardCaretKeep"))) clearBoardCaret();
					return null;
				}
			}),
			// Normalizer: an emptied block (all boards deleted or dragged out)
			// dissolves into an empty line; blocks left ADJACENT (the line
			// between them deleted) merge into one, like text lines joining;
			// and blocks born without an id (parse, paste) get one.
			new Plugin({
				appendTransaction: (transactions, oldState, state) => {
					if (!transactions.some(tr => tr.docChanged)) return null;
					const tr = state.tr;
					let changed = false;
					state.doc.descendants((n, pos) => {
						if (!isBlock(n)) return true;
						if ((n.attrs.boards ?? []).length === 0) {
							const mapped = tr.mapping.map(pos);
							tr.replaceWith(mapped, mapped + n.nodeSize, state.schema.nodes.paragraph.create());
							changed = true;
						}
						return false;
					});
					// merge runs of adjacent non-empty blocks (the first
					// block's id survives; the virtual caret rides along)
					let run = null;
					const flushRun = () => {
						if (run && run.nodes.length > 1) {
							const boards = run.nodes.flatMap(n => n.attrs.boards ?? []);
							tr.replaceWith(
								tr.mapping.map(run.start),
								tr.mapping.map(run.end),
								state.schema.nodes.chessboardBlock.create({ id: run.nodes[0].attrs.id, boards })
							);
							if (boardCaret.blockId != null) {
								let offset = 0;
								for (const n of run.nodes) {
									if (n.attrs.id === boardCaret.blockId) {
										boardCaret.blockId = run.nodes[0].attrs.id;
										boardCaret.index += offset;
										boardCaret.anchor = null;
										break;
									}
									offset += (n.attrs.boards ?? []).length;
								}
							}
							changed = true;
						}
						run = null;
					};
					state.doc.forEach((n, offset) => {
						if (isBlock(n) && (n.attrs.boards ?? []).length > 0) {
							run ??= { start: offset, nodes: [] };
							run.nodes.push(n);
							run.end = offset + n.nodeSize;
						} else {
							flushRun();
						}
					});
					flushRun();
					state.doc.descendants((n, pos) => {
						if (!isBlock(n)) return true;
						if (!n.attrs.id) {
							tr.setNodeAttribute(tr.mapping.map(pos), "id", crypto.randomUUID());
							changed = true;
						}
						return false;
					});
					return changed ? tr : null;
				}
			}),
			// blocks inside a range selection tint blue like selected text
			new Plugin({
				props: {
					decorations: state => {
						const { from, to, empty } = state.selection;
						if (empty) return null;
						const decos = [];
						state.doc.nodesBetween(from, to, (node, pos) => {
							if (isBlock(node)) {
								decos.push(Decoration.node(pos, pos + node.nodeSize, { class: "board-block-selected" }));
							}
						});
						return decos.length ? DecorationSet.create(state.doc, decos) : null;
					},
					// pasted blocks get fresh board ids
					transformPasted: slice => new Slice(withFreshIds(slice.content), slice.openStart, slice.openEnd)
				}
			})
		]
	}
})
