<script>
	import BulletListIcon from "$lib/icons/BulletList.svelte"
	import NumberedListIcon from "$lib/icons/NumberedList.svelte"
	import BoldIcon from "$lib/icons/Bold.svelte"
	import ItalicIcon from "$lib/icons/Italic.svelte"
	import UndoIcon from "$lib/icons/Undo.svelte"
	import RedoIcon from "$lib/icons/Redo.svelte"
	import ChessboardAddIcon from "$lib/icons/ChessboardAdd.svelte"

	// Anki-style shared menu bar: one bar serving both side editors, acting on
	// the focused one. menu is the page's { editor, focused } state, reassigned
	// on focus/blur and every transaction. Read via menu.editor everywhere —
	// deriving the editor once would collapse reactivity to the stable editor
	// instance, and isActive/can would never be re-read.
	let { menu, onAddChessboard } = $props();
</script>

<!-- preventDefault on mousedown stops the browser from stealing focus from
the editor when a menu button is pressed, click still fires -->
<div class="fixed-menu" role="toolbar" tabindex="-1" onmousedown={e => e.preventDefault()}>
	<div class="button-row">
		<button
			title="Bold text (ctrl-b)"
			onclick={() => menu.editor.chain().focus().toggleBold().run()}
			class:active={menu.editor?.isActive("bold")}
			disabled={!menu.focused}
		>
			<BoldIcon />
		</button>
		<button
			title="Italic text (ctrl-i)"
			onclick={() => menu.editor.chain().focus().toggleItalic().run()}
			class:active={menu.editor?.isActive("italic")}
			disabled={!menu.focused}
		><ItalicIcon />
		</button>
	</div>
	<span class="seperator"></span>
	<div class="button-row">
		<button
			title="Unordered list (ctrl-u)"
			onclick={() => menu.editor.chain().focus().toggleBulletList().run()}
			class:active={menu.editor?.isActive("bulletList")}
			disabled={!menu.focused}
		><BulletListIcon />
		</button>
		<button
			title="Ordered list (ctrl-o)"
			onclick={() => menu.editor.chain().focus().toggleOrderedList().run()}
			class:active={menu.editor?.isActive("orderedList")}
			disabled={!menu.focused}
		><NumberedListIcon />
		</button>
	</div>
	<span class="seperator"></span>
	<div class="button-row">
		<button
			class="add-board-btn"
			title="Add chessboard (ctrl-k)"
			disabled={!menu.focused}
			onclick={onAddChessboard}
		><ChessboardAddIcon />
		</button>
	</div>
	<span class="seperator"></span>
	<div class="button-row">
		<button
			title="Undo (ctrl-z)"
			disabled={!menu.focused || !menu.editor.can().undo()}
			onclick={() => menu.editor.chain().focus().undo().run()}
		><UndoIcon />
		</button>
		<button
			title="Redo (ctrl-y)"
			disabled={!menu.focused || !menu.editor.can().redo()}
			onclick={() => menu.editor.chain().focus().redo().run()}
		><RedoIcon />
		</button>
	</div>
</div>

<style>
	/* flush with the bar's left edge (which the page aligns with the editors) */
	.fixed-menu {
		display: flex;
		padding: 5px 0 6px 0;
		background: white;
		/* the hr under the bar, spanning the editors' width */
		border-bottom: 1px solid #ddd;
	}
	/* fixed width, not padding: the icons' intrinsic aspect ratios differ, so
	   padding-sized buttons come out unequal (B wider than I) */
	button {
		width: 30px;
		padding: 3px 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	button.active {
		background: radial-gradient(#408ee0, #0051a2);
	}
	button.active :global(svg) {
		color: white;
	}
	button:disabled {
		color: rgba(0, 0, 0, 0.2);
	}
	.fixed-menu :global(svg) {
		height: 0.85rem;
	}
	.add-board-btn :global(svg) {
		height: 1rem;
	}
</style>
