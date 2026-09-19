<script>
	import { onMount, onDestroy } from "svelte"
	import { Editor, Extension } from "@tiptap/core"
	import Document from "@tiptap/extension-document"
	import Text from "@tiptap/extension-text"
	import Paragraph from "@tiptap/extension-paragraph"
	import HardBreak from "@tiptap/extension-hard-break"
	import Bold from "@tiptap/extension-bold"
	import Italic from "@tiptap/extension-italic"
	import { BulletList, OrderedList, ListItem } from "@tiptap/extension-list"
	import { UndoRedo, Dropcursor, Gapcursor } from "@tiptap/extensions"
	import { Selection } from "@tiptap/pm/state"
	import { GapCursor } from "@tiptap/pm/gapcursor"
	import { dndzone, SHADOW_ITEM_MARKER_PROPERTY_NAME } from "svelte-dnd-action"
	import { setBoardCaret, clearBoardCaret } from "$lib/block-caret-state.svelte.js"
	import { blockDnd } from "$lib/block-dnd-state.svelte.js"
	import { BlockNode, BlockNavigation, insertChessboardBlock, insertBoardAtCaret, appendBlockWithBoards, configureBlockUiCleanup } from "$lib/tiptap-chessboard-block/index.js"
	import { MoveRef } from "$lib/tiptap-move-ref.js"

	// One side of the add-cards editor: a tiptap document where a whole
	// chessboard block (v1-style, boards inside managed by buttons and
	// svelte-dnd) is embedded content that just takes up space — the text
	// caret lives in the lines around it, and a virtual board caret works
	// inside the blocks (tiptap-chessboard-block/).
	let element = $state()
	let editor = $state(null)
	let { boardUi, isBack = false, initialDoc = null, duplicate = false, onDocChanged = null, onEditorFocus = null, onEditorBlur = null, onEditorTransaction = null } = $props();

	export const getJson = () => editor?.getJSON();
	export const getEditor = () => editor;
	// the view, not commands.focus(): the latter resolves a text position and
	// silently does nothing when the parked selection is a gap cursor (a
	// board-first document), and would re-select everything for "start"
	export const focus = () => editor?.view.focus();

	// focus with the caret at the document's end. Ending with a chessboard
	// block, that spot belongs to the virtual board caret (a bar beside the
	// last board) rather than a gap cursor's horizontal line.
	export const focusEnd = () => {
		if (!editor) return;
		const last = editor.state.doc.lastChild;
		if (last?.type.name === "chessboardBlock" && last.attrs.id) {
			setBoardCaret(last.attrs.id, (last.attrs.boards ?? []).length, "up");
		} else {
			clearBoardCaret();
		}
		editor.view.focus();
	}
	export const clear = () => editor?.commands.clearContent(true);

	// the submit's clear, with frozen boards surviving it: what is left is one
	// block holding them, in the order they were written (add-cards)
	export const clearKeeping = boards => {
		if (!editor) return;
		editor.commands.clearContent(true);
		if (boards.length > 0) appendBlockWithBoards(editor.view, boards);
	}

	// Whether this side already holds a chessboard block — a board dragged in
	// from the other side lands in that block's own dnd zone, and only a side
	// WITHOUT one needs the landing pad below.
	let hasBlock = $state(false);
	// takes the editor: tiptap fires its first transactions while the Editor
	// constructor is still running, before `editor` has been assigned
	const syncHasBlock = ed => {
		let found = false;
		ed?.state.doc.forEach(node => { if (node.type.name === "chessboardBlock") found = true });
		hasBlock = found;
	}

	// The landing pad for a board dragged onto a side that has no block of its
	// own. It is mounted at all times (svelte-dnd snapshots its zones when a
	// drag STARTS — a zone that appears mid-drag is never watched) and stays
	// out of flow at zero size, taking no space and catching no pointer; only
	// a running board drag on a blockless side opens it over the editor.
	let dropItems = $state([]);
	const padOpen = $derived(blockDnd.dragging && !hasBlock);
	const bare = ({ [SHADOW_ITEM_MARKER_PROPERTY_NAME]: _shadow, ...board }) => board;
	const handlePadDrop = e => {
		const dropped = e.detail.items.map(bare);
		dropItems = [];
		blockDnd.dragging = false;
		document.body.classList.remove("dnd-grabbing");
		if (dropped.length > 0 && editor) appendBlockWithBoards(editor.view, dropped);
	}

	onMount(() => {
		const customHardBreak = HardBreak.extend({
			addKeyboardShortcuts() {
				return {
					"Shift-Enter": () => this.editor.commands.setHardBreak()
				}
			}
		});
		const customBulletList = BulletList.extend({
			addKeyboardShortcuts() {
				return {
					"Mod-u": () => this.editor.commands.toggleBulletList()
				}
			}
		})
		const customOrderedList = OrderedList.extend({
			addKeyboardShortcuts() {
				return {
					"Mod-o": () => this.editor.commands.toggleOrderedList()
				}
			}
		})
		// deletions via the virtual caret clean the shared editing state
		configureBlockUiCleanup(id => {
			boardUi.editingIds.delete(id);
			delete boardUi.editorStates[id];
		});
		// Mod-k, not Mod-m: plain ctrl-m is mute in too many apps
		const chessboardShortcut = Extension.create({
			name: "chessboardShortcut",
			addKeyboardShortcuts() {
				return {
					"Mod-k": ({ editor }) => {
						// at a virtual gap the new board joins that block
						if (insertBoardAtCaret(editor, boardUi)) return true;
						insertChessboardBlock(editor, boardUi);
						return true;
					}
				}
			}
		})
		editor = new Editor({
			element: element,
			extensions: [
				Document, Paragraph, customHardBreak, Text, Bold, Italic,
				customOrderedList, customBulletList, ListItem, UndoRedo,
				Dropcursor, BlockNavigation, Gapcursor, chessboardShortcut,
				MoveRef,
				BlockNode.configure({ ui: boardUi, isBack })
			],
			content: initialDoc ?? "",
			editorProps: {
				attributes: { spellcheck: "false" }
			},
			onUpdate: ({ editor }) => { syncHasBlock(editor); onDocChanged?.() },
			onFocus: ({ editor }) => onEditorFocus?.(editor),
			onBlur: ({ editor }) => onEditorBlur?.(editor),
			onTransaction: ({ editor }) => { syncHasBlock(editor); onEditorTransaction?.(editor) },
		})
		// An existing card's document opens with the caret at its END (where
		// you continue writing). It must be parked explicitly: PM's default
		// selection has no text to land on when the document begins with a
		// chessboard block, so it falls back to selecting everything — every
		// block would render tinted. Synchronous, in the same task as the
		// editor's creation: tiptap defers its own onCreate hook, which would
		// let the all-selection paint for a frame (a blue flash).
		// (no $-prefixed names: svelte reserves that prefix, even though it
		// is prosemirror's convention for resolved positions)
		syncHasBlock(editor);
		if (initialDoc) {
			const { state } = editor;
			const end = state.doc.resolve(state.doc.content.size);
			// a gap cursor first: with a chessboard block last, Selection.near
			// skips the atom and lands at the end of the text ABOVE it, which
			// is not the document's end
			const near = Selection.near(end, -1);
			const sel = GapCursor.valid(end)
				? new GapCursor(end)
				: near.empty ? near : new GapCursor(end);
			if (!state.selection.eq(sel)) editor.view.dispatch(state.tr.setSelection(sel));
		}
	})
	onDestroy(() => {
		editor?.destroy()
	})
</script>

<div class="tiptap" class:duplicate>
	<div bind:this={element} class="text-area"></div>
	<!-- svelte-ignore a11y_no_static_element_interactions -- pointer-only drop target -->
	<div
		class="board-drop"
		class:open={padOpen}
		use:dndzone={{
			items: dropItems,
			type: "block-letter-boards",
			flipDurationMs: 0,
			useCursorForDetection: true,
			morphDisabled: true,
			transformDraggedElement: el => el.style.opacity = "0.85",
			dropTargetStyle: {}
		}}
		onconsider={e => dropItems = e.detail.items}
		onfinalize={handlePadDrop}
	>
		{#each dropItems as item (item.id)}
			<div class="drop-ghost" style:height={blockDnd.dragHeight + "px"}></div>
		{/each}
	</div>
</div>

<style>
	.tiptap {
		position: relative;
		border: 2px solid rgba(0, 0, 0, 0.2);
		background: white;
		width: 100%;
		/* the card's own prose size (app.css), so a paragraph is written at
		   the size it will be answered at */
		font-size: var(--card-text-size);
	}
	/* our own focus ring on the border (like Firefox's blue) instead of
	   Chrome's black UA outline on the contenteditable — steel blue, held
	   apart from the accent */
	.tiptap:focus-within {
		border-color: #527ab3;
	}
	/* the side duplicates an existing card's: red outranks the focus ring,
	   the side being typed in is exactly the one holding focus */
	.tiptap.duplicate,
	.tiptap.duplicate:focus-within {
		border-color: red;
	}
	.tiptap :global(.ProseMirror) {
		outline: none;
	}

	:global(.ProseMirror) {
		padding: 4px 10px;
		/* board numbering; the back side continues the front's count via
		   --board-offset (set by the page) */
		counter-reset: board var(--board-offset, 0);
	}
	.tiptap :global(p:first-child) {
		margin: 7px 0 0.6em 0;
	}
	.tiptap :global(p) {
		margin: 0.6em 0;
	}
	/* the input's inside spacing reads equal top and bottom: the last
	   line's bottom margin matches the first line's 7px top */
	.tiptap :global(p:last-child) {
		margin-bottom: 7px;
	}
	/* The card's leading, but not its measure: capping the text left the input
	   stopping short of its own border, which reads as a bug. The box cannot
	   shrink to the measure instead — board blocks live in this same editor
	   and would shrink off the card's sizes with it. So a line breaks wider
	   here than it will on the card. */
	.tiptap :global(:is(p, ul, ol)) {
		line-height: var(--card-text-leading);
	}

	/* a move wired to a board wears the same quiet grey it wears on the card
	   (app.css), so what will be clickable is visible as it is written */
	.tiptap :global(.move-ref) {
		border-radius: 3px;
		padding: 1px 4px;
		margin: 0 -2px;
		white-space: nowrap;
		background-color: rgba(0, 0, 0, 0.1);
	}
	.tiptap :global(.move-ref:hover) {
		background-color: rgba(0, 0, 0, 0.18);
	}

	/* the landing pad: nothing at all until a board drag opens it, and never
	   a pointer target — svelte-dnd finds it by cursor geometry, not by hit
	   testing, so the editor underneath keeps every click */
	.board-drop {
		position: absolute;
		top: 0;
		left: 0;
		width: 0;
		height: 0;
		overflow: hidden;
		pointer-events: none;
	}
	.board-drop.open {
		inset: 0;
		width: auto;
		height: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 6px;
		border: 2px dashed rgba(0, 0, 0, 0.25);
		background: rgba(0, 0, 0, 0.03);
	}
	.drop-ghost {
		width: 100%;
		max-height: 100%;
		border-radius: 3px;
		background: rgba(0, 0, 0, 0.06);
	}

	/* --- chessboard blocks: one giant letter per block --- */
	.tiptap :global(.board-block) {
		position: relative;
	}
	/* the gap around a block is separation from neighbouring TEXT, so it
	   comes from the neighbours: a board-only side has no stray padding */
	.tiptap :global(:is(p, ul, ol) + .board-block),
	.tiptap :global(.board-block + :is(p, ul, ol)) {
		margin-top: 14px;
	}
	/* part of a range selection: tinted like selected text */
	.tiptap :global(.board-block.board-block-selected)::before {
		content: "";
		position: absolute;
		inset: 0;
		background: rgba(0, 90, 224, 0.28);
		pointer-events: none;
		z-index: 2;
	}

	/* lists flush with the prose, as the card shows them (app.css) */
	.tiptap :global(:is(ul, ol)) {
		padding-inline-start: 1.2em;
		margin: 0.6em 0;
	}
	.tiptap :global(:is(ul, ol) li p) {
		margin: 0;
	}
	/* v1's board numbers, shown when the card has more than one board
	   (.show-board-numbers on the page's wrapper); CSS counters number
	   across blocks in document order */
	/* drawn into the strip the board already carries for its side-to-move
	   square (Chessboard's .board-header), where the numbered pages put it —
	   styled like study/browse's .board-number (app.css) */
	:global(.show-board-numbers) .tiptap :global(.board-header)::before {
		counter-increment: board;
		content: counter(board);
		font-size: 1.05rem;
		font-weight: 600;
		line-height: 1;
		color: #404040;
	}

	/* cursor semantics: boards drag (svelte-dnd), everything else is normal */
	.tiptap :global(.board-cell) {
		cursor: grab;
	}
	/* the dnd library stamps inline user-select: none on each cell, which
	   in Chrome also blocks drag-selecting text inside child inputs — give
	   the islands' text fields their selection back */
	.tiptap :global(.board-block :is(input, textarea)) {
		cursor: text;
		user-select: text;
		-webkit-user-select: text;
		-moz-user-select: text;
	}
	/* While PM's own selection is a gap cursor (any parked board caret) it
	   marks the root .ProseMirror-hideselection, whose stylesheet paints
	   EVERY selection inside transparent — including the text you select in
	   an island's FEN field. Firefox honours that inside form fields, Chrome
	   doesn't. Give the islands their native highlight back. */
	:global(.ProseMirror-hideselection) .tiptap :global(.board-block *::selection),
	.tiptap :global(.ProseMirror-hideselection .board-block *::selection) {
		background: Highlight;
		color: HighlightText;
	}
	.tiptap :global(.board-block :is(button:enabled, select, a[href])) {
		cursor: pointer;
	}
	.tiptap :global(.board-block-editing .cm-chessboard) {
		cursor: auto;
	}
	:global(body.dnd-grabbing),
	:global(body.dnd-grabbing *) {
		cursor: grabbing !important;
	}
	/* the native text caret (and any parked gap cursor) hides while the
	   virtual board caret is active — but caret-color inherits, so the
	   board islands' text fields (FEN inputs) get theirs back */
	:global(.ProseMirror.virtual-caret-active) {
		caret-color: transparent;
	}
	:global(.ProseMirror.virtual-caret-active :is(input, textarea)) {
		caret-color: auto;
	}
	:global(.ProseMirror.virtual-caret-active .ProseMirror-gapcursor) {
		display: none;
	}
</style>
