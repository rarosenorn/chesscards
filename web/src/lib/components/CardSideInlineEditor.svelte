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
	import { InlineBoardNode, insertChessboardInline } from "$lib/tiptap-chessboard-inline.svelte.js"

	// The Add cards 4 trial: one tiptap document per side where chessboards
	// are INLINE atoms — giant letters in paragraphs. Caret, selection,
	// clipboard, joins and drag and drop are native text behavior; nothing is
	// hand-rolled (contrast CardSideDocEditor). Same page contract as the
	// block variant.
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
						insertChessboardInline(editor, boardUi);
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
				Dropcursor, Gapcursor, chessboardShortcut,
				InlineBoardNode.configure({ ui: boardUi, isBack })
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

	/* --- inline boards: giant letters, but on their own lines (the
	   normalizer keeps text and boards in separate paragraphs) --- */
	.tiptap :global(.board-inline) {
		display: inline-block;
		width: 370px;
		vertical-align: bottom;
		margin: 4px 10px;
		position: relative;
		/* the board line's giant caret line-height must not leak into the
		   island's own UI */
		line-height: normal;
	}
	/* Board lines center like the block editor's grid (a board paragraph
	   contains only boards, so :has is exact). The native caret sizes to the
	   line-height, so matching it to the board height gives the full-height
	   caret — native blink, native wrap affinity, no synthetic caret. */
	.tiptap :global(p:has(> .board-inline)) {
		text-align: center;
		line-height: 398px;
		caret-color: black;
	}
	/* an open editor takes over its line: no caret-sized line box behind it */
	.tiptap :global(p:has(> .board-inline-editing)) {
		line-height: normal;
	}
	/* an open board editor takes its own full-width line */
	.tiptap :global(.board-inline.board-inline-editing) {
		display: block;
		width: 100%;
		margin: 4px 0;
	}
	/* part of a range selection: tinted like selected text (the island gets
	   no native ::selection paint) */
	.tiptap :global(.board-inline.board-selected)::after {
		content: "";
		position: absolute;
		inset: 0;
		background: rgba(0, 90, 224, 0.28);
		pointer-events: none;
		z-index: 2;
	}
	/* text-select gesture over boards; only a selected (blue) board drags,
	   and advertises it */
	.tiptap :global(.board-inline) {
		cursor: text;
	}
	.tiptap :global(.board-inline.board-selected) {
		cursor: grab;
	}
	.tiptap :global(.board-inline :is(input, textarea)) {
		cursor: text;
	}
	.tiptap :global(.board-inline :is(button:enabled, select, a[href])) {
		cursor: pointer;
	}
	.tiptap :global(.board-inline-editing .cm-chessboard) {
		cursor: auto;
	}
</style>
