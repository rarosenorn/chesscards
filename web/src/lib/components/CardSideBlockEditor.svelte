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
	import { BlockNode, BlockNavigation, insertChessboardBlock, insertBoardAtCaret, configureBlockUiCleanup } from "$lib/tiptap-chessboard-block/index.js"

	// One side of the add-cards editor: a tiptap document where a whole
	// chessboard block (v1-style, boards inside managed by buttons and
	// svelte-dnd) is embedded content that just takes up space — the text
	// caret lives in the lines around it, and a virtual board caret works
	// inside the blocks (tiptap-chessboard-block/).
	let element = $state()
	let editor = $state(null)
	let { boardUi, isBack = false, initialDoc = null, onDocChanged = null, onEditorFocus = null, onEditorBlur = null, onEditorTransaction = null } = $props();

	export const getJson = () => editor?.getJSON();
	export const getEditor = () => editor;
	// the view, not commands.focus(): the latter resolves a text position and
	// silently does nothing when the parked selection is a gap cursor (a
	// board-first document), and would re-select everything for "start"
	export const focus = () => editor?.view.focus();
	export const clear = () => editor?.commands.clearContent(true);

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
				BlockNode.configure({ ui: boardUi, isBack })
			],
			content: initialDoc ?? "",
			editorProps: {
				attributes: { spellcheck: "false" }
			},
			onUpdate: () => onDocChanged?.(),
			onFocus: ({ editor }) => onEditorFocus?.(editor),
			onBlur: ({ editor }) => onEditorBlur?.(editor),
			onTransaction: ({ editor }) => onEditorTransaction?.(editor),
		})
		// A document starting with a chessboard block has no text for PM's
		// default atStart selection to land on, so it falls back to selecting
		// everything — every block would render tinted. Park a collapsed
		// selection at the start instead. Synchronous, in the same task as
		// the editor's creation: tiptap defers its own onCreate hook, which
		// would let the all-selection paint for a frame (a blue flash).
		// (no $-prefixed names: svelte reserves that prefix, even though it
		// is prosemirror's convention for resolved positions)
		if (initialDoc) {
			const { state } = editor;
			const start = state.doc.resolve(0);
			const near = Selection.near(start, 1);
			const sel = near.empty
				? near
				: GapCursor.valid(start) ? new GapCursor(start) : near;
			if (!state.selection.eq(sel)) editor.view.dispatch(state.tr.setSelection(sel));
		}
	})
	onDestroy(() => {
		editor?.destroy()
	})
</script>

<div class="tiptap">
	<div bind:this={element} class="text-area"></div>
</div>

<style>
	.tiptap {
		border: 2px solid rgba(0, 0, 0, 0.2);
		background: white;
		width: 100%;
	}
	/* our own accent focus ring on the border (like Firefox's blue) instead
	   of Chrome's black UA outline on the contenteditable */
	.tiptap:focus-within {
		border-color: var(--accent);
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

	/* --- chessboard blocks: one giant letter per block --- */
	.tiptap :global(.board-block) {
		position: relative;
		margin: 10px 0;
		padding: 4px 0;
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

	/* v1's board numbers, shown when the card has more than one board
	   (.show-board-numbers on the page's wrapper); CSS counters number
	   across blocks in document order */
	/* styled like study/browse's .board-number (app.css) */
	:global(.show-board-numbers) .tiptap :global(.board-cell)::before {
		counter-increment: board;
		content: counter(board);
		font-size: 1.05rem;
		font-weight: 600;
		color: #404040;
		padding-left: 6px;
		margin-bottom: 2px;
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
