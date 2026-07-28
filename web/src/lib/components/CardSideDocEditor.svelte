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
	import { BoardNode, BoardGridNode, BoardNavigation, insertChessboard } from "$lib/tiptap-chessboard.svelte.js"

	// One tiptap document = one card side: text and chessboards live in the
	// same editor (the Add cards 3 trial). The menu bar lives on the page,
	// shared by both sides (DocEditorMenuBar) — onEditorFocus/onEditorTransaction
	// feed it the live editor. boardUi is the shared editing-state store the
	// board node views use, created by the page.
	let element = $state()
	let editor = $state(null)
	let { boardUi, isBack = false, onDocChanged = null, onEditorFocus = null, onEditorBlur = null, onEditorTransaction = null } = $props();

	export const getJson = () => editor?.getJSON();
	export const getEditor = () => editor;
	export const focus = () => editor?.commands.focus();
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
		const chessboardShortcut = Extension.create({
			name: "chessboardShortcut",
			addKeyboardShortcuts() {
				return {
					"Mod-m": ({ editor }) => {
						insertChessboard(editor, boardUi);
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
				Dropcursor, BoardNavigation, Gapcursor, chessboardShortcut,
				BoardNode.configure({ ui: boardUi, isBack }),
				BoardGridNode
			],
			content: "",
			editorProps: {
				attributes: { spellcheck: "false" }
			},
			onUpdate: () => onDocChanged?.(),
			onFocus: ({ editor }) => onEditorFocus?.(editor),
			onBlur: ({ editor }) => onEditorBlur?.(editor),
			onTransaction: ({ editor }) => onEditorTransaction?.(editor),
		})
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

	:global(.ProseMirror) {
		padding: 4px 18px;
	}
	.tiptap :global(p:first-child) {
		margin: 7px 0 0.6em 0;
	}
	.tiptap :global(p) {
		margin: 0.6em 0;
	}

	/* --- board nodes (DOM built by tiptap-chessboard's node views) --- */
	.tiptap :global(.board-grid-node) {
		padding: 10px 0;
		/* the grid shares the ProseMirror padding, so a pair of boards runs
		   flush with the text on both ends (390px cells). The boards'
		   min-width sits below the cell size (ChessboardNode) — any cell
		   under the min overflows into the gap and visibly eats it */
	}
	.tiptap :global(.board-grid) {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		grid-auto-flow: dense;
		gap: 20px;
	}
	/* a lone board keeps a 2-column cell's size, centered (as in the block
	   editor) */
	.tiptap :global(.board-grid.single) {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.tiptap :global(.board-grid.single > .board-node:not(.board-node-editing)) {
		width: calc(50% - 10px);
		min-width: min-content;
	}
	.tiptap :global(.board-node) {
		position: relative;
		display: flex;
		flex-direction: column;
	}
	/* an open board editor takes the grid's full row */
	.tiptap :global(.board-node.board-node-editing) {
		grid-column: 1 / -1;
		width: 100%;
	}
	/* The board-height caret. The gap cursor's own element can't lay out
	   inside the grid (any in-flow child would claim a cell and shift the
	   boards), so it stays hidden and the caret renders as a pseudo-element
	   on the neighboring board: before the board that follows the gap, or
	   after the last board when the gap is at the grid's end. In the 20px
	   between-board gap the two candidate positions coincide, so only the
	   following board's is used. */
	.tiptap :global(.board-grid > .ProseMirror-gapcursor) {
		display: none;
	}
	/* The caret belongs to the board it comes after (like a letter's caret
	   sits after the glyph) — except where the gap position sits at a row
	   boundary or the line's start: there it renders before the board that
	   opens the next row (caret-line-start, set by the boardNavigation
	   plugin). Width 1px: any fractional width renders unevenly across
	   device pixels. */
	.tiptap :global(.board-grid > .ProseMirror-gapcursor.caret-line-start + .board-node)::before,
	.tiptap :global(.board-grid > .board-node:has(+ .ProseMirror-gapcursor:not(.caret-line-start)))::after {
		content: "";
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: black;
		/* hard toggle, 1s on / 1s off */
		animation: board-caret-blink 2s step-end infinite;
	}
	.tiptap :global(.board-grid > .ProseMirror-gapcursor.caret-line-start + .board-node)::before {
		left: -7px;
	}
	.tiptap :global(.board-grid > .board-node:has(+ .ProseMirror-gapcursor:not(.caret-line-start)))::after {
		right: -7px;
	}
	@keyframes -global-board-caret-blink {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0;
		}
	}

	/* draggable islands advertise grab, except over interactive parts
	   (mirrors the INTERACTIVE guard, where a press won't start a drag) */
	.tiptap :global(:is(.board-node, .board-grid-node)) {
		cursor: grab;
	}
	.tiptap :global(:is(.board-node, .board-grid-node) :is(input, textarea)) {
		cursor: text;
	}
	.tiptap :global(:is(.board-node, .board-grid-node) :is(button:enabled, select, a[href])) {
		cursor: pointer;
	}
	.tiptap :global(.board-node-editing .cm-chessboard) {
		cursor: auto;
	}
</style>
