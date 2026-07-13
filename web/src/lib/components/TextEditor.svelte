<script>
	import { onMount, onDestroy } from "svelte"
	import { Editor } from "@tiptap/core"
	import Document from "@tiptap/extension-document"
	import Text from "@tiptap/extension-text"
	import Paragraph from "@tiptap/extension-paragraph"
	import HardBreak from "@tiptap/extension-hard-break"
	import Bold from "@tiptap/extension-bold"
	import Italic from "@tiptap/extension-italic"
	import { BulletList, OrderedList, ListItem } from "@tiptap/extension-list"
	import { UndoRedo } from "@tiptap/extensions"

	import BulletListIcon from "$lib/icons/BulletList.svelte"
	import NumberedListIcon from "$lib/icons/NumberedList.svelte"
	import BoldIcon from "$lib/icons/Bold.svelte"
	import ItalicIcon from "$lib/icons/Italic.svelte"
	import UndoIcon from "$lib/icons/Undo.svelte"
	import RedoIcon from "$lib/icons/Redo.svelte"

	let element = $state()
	let editorState = $state({editor: null})
	let { content = "", getJSON = $bindable() } = $props();

	// I did getJson and getJsonInternal because editor is created in onMount
	// and you cant export let for component API, so i do export const which returns
	// a function that calls getJsonInternal, which is set to the editor getJson
	// in onMount
	export const getJson = () => editorState.editor?.getJSON();
	export const focus = () => editorState.editor?.commands.focus();
	export const isEmpty = () => editorState.editor?.isEmpty;

	onMount(() => {
		// customHardBreak extension without ctrl-enter to hard break
		// so it doesnt hard break when adding card with shortcut
		// keeping only shift-enter for hardbreak
		const customHardBreak = HardBreak.extend({
			addKeyboardShortcuts() {
				return {
					"Shift-Enter": () => this.editor.commands.setHardBreak()
				}
			}
		});
		editorState.editor = new Editor({
			element: element,
			extensions: [Document, Paragraph, customHardBreak, Text, Bold, Italic, OrderedList, BulletList, ListItem, UndoRedo],
			content: content,
			onTransaction: ({ editor }) => {
				// Update the state signal to force a re-render
				editorState = { editor }
			},
		})
	})
	onDestroy(() => {
		editorState.editor?.destroy()
	})
</script>

<div class="tiptap">
	{#if editorState.editor}
		<div class="fixed-menu">
			<div class="button-row">
				<button
					title="Bold text (ctrl-b)"
					onclick={() => editorState.editor.chain().focus().toggleBold().run()}
					class:active={editorState.editor.isActive("bold")}
					disabled={!editorState.editor.isFocused}
				>
					<BoldIcon />
				</button>
				<button
					title="Italic text (ctrl-i)"
					onclick={() => editorState.editor.chain().focus().toggleItalic().run()}
					class:active={editorState.editor.isActive("italic")}
					disabled={!editorState.editor.isFocused}
				><ItalicIcon />
				</button>
			</div>
			<span class="seperator"></span>
			<div class="button-row">
				<button
					title="Unordered list"
					onclick={() => editorState.editor.chain().focus().toggleBulletList().run()}
					class:active={editorState.editor.isActive("bulletList")}
					disabled={!editorState.editor.isFocused}
				><BulletListIcon />
				</button>
				<button
					title="Ordered list"
					onclick={() => editorState.editor.chain().focus().toggleOrderedList().run()}
					class:active={editorState.editor.isActive("orderedList")}
					disabled={!editorState.editor.isFocused}
				><NumberedListIcon />
				</button>
			</div>
			<span class="seperator"></span>
			<div class="button-row">
				<button
					title="Undo (ctrl-z)"
					disabled={!editorState.editor.isFocused || !editorState.editor.can().undo()}
					onclick={() => editorState.editor.chain().focus().undo().run()}
				><UndoIcon />
				</button>
				<button
					title="Redo (ctrl-y)"
					disabled={!editorState.editor.isFocused || !editorState.editor.can().redo()}
					onclick={() => editorState.editor.chain().focus().redo().run()}
				><RedoIcon />
				</button>
			</div>
		</div>
	{/if}
	<div bind:this={element} class="text-area"></div>
</div>

<style>
	.tiptap {
		border: 2px solid rgba(0, 0, 0, 0.2);
		background: white;
		width: 100%;
	}
	.fixed-menu {
		display: flex;
		padding: 4px 6px;
		border-bottom: 1px solid silver;
		background: white;

	}
	button {
		padding: 3px 6px;
	}
	button.active {
		background: radial-gradient(#408ee0, #0051a2);
	}
	.tiptap button.active :global(svg) {
		color: white;
	}
	button:disabled {
		color: rgba(0, 0, 0, 0.2);
	}
	.fixed-menu :global(svg) {
		height: 0.85rem;
	}

	:global(.ProseMirror) {
		padding: 4px 14px;
	}
	.tiptap :global(p:first-child) {
		margin: 7px 0 0.6em 0;
	}
	.tiptap :global(p) {
		margin: 0.6em 0;
	}
</style>
