<script>
	// Experimental "Add cards 3": the pure-PM trial. Each side is a single
	// tiptap editor where text and chessboards live in one document (boards as
	// PM nodes, dragged/reordered/undone by ProseMirror). Submit converts each
	// doc to the stored block-array format, so study/browse need no changes.
	// Deliberately minimal next to Add cards 1: no tab trap, no draft
	// persistence across tabs, no board numbers/eye/duplicate, no FEN gating.
	import { getContext, onMount } from "svelte"
	import { enhance } from "$app/forms"
	import CardSideDocEditor from "$lib/components/CardSideDocEditor.svelte"
	import DocEditorMenuBar from "$lib/components/DocEditorMenuBar.svelte"
	import { insertChessboard } from "$lib/tiptap-chessboard.svelte.js"
	import { docSideJson, docHasContent } from "$lib/card-utils.js"

	// the shared deck context (layout); new cards are pushed into it so
	// browse/study see them without a reload
	const deck = getContext("deck");

	// Anki-style mode: applies to every card added until changed
	let cardType = $state("basic");

	// shared board-editing state (see ChessboardNode.svelte): survives PM node
	// view recreation on drags, and lets the submit apply open editors; board
	// ids are unique, so one store serves both sides
	const boardUi = { editingIds: new Set(), editorStates: {}, applyEditors: {} };

	// bound to the two CardSideDocEditor instances
	let frontEditor, backEditor;
	let addCardForm;

	// The shared menu bar acts on whichever editor is focused; reassigned
	// (fresh object) so the bar's active states stay live. focused is an
	// explicit flag from tiptap's focus/blur events — NOT editor.isFocused,
	// whose live view.hasFocus() stays true while focus sits inside a board
	// island (it's inside the view's DOM), which kept the bar enabled
	// Every handler defers via queueMicrotask: tiptap emits focus/blur/
	// transaction events synchronously from wherever the DOM event lands —
	// including from inside a Svelte render flush (a mounting board editor
	// steals focus, tiptap dispatches blur mid-template-evaluation), where
	// mutating $state throws state_unsafe_mutation and aborts the transaction.
	let menu = $state({ editor: null, focused: false });
	const handleEditorFocus = editor => queueMicrotask(() => {
		// pending format toggles travel between the sides: bold switched on in
		// the front stays on when the caret moves to the back
		const prev = menu.editor;
		if (prev && prev !== editor) {
			if (prev.isActive("bold") !== editor.isActive("bold")) editor.commands.toggleBold();
			if (prev.isActive("italic") !== editor.isActive("italic")) editor.commands.toggleItalic();
		}
		menu = { editor, focused: true };
	});
	const handleEditorBlur = editor => queueMicrotask(() => {
		if (menu.editor === editor && !editor.isFocused) menu = { editor, focused: false };
	});
	const handleEditorRefresh = editor => queueMicrotask(() => {
		if (menu.editor === editor) menu = { ...menu, editor };
	});

	// + Chessboard inserts into the last-focused editor
	const addChessboard = () =>
		insertChessboard(menu.editor ?? frontEditor.getEditor(), boardUi);

	let formAttemptedAndInvalid = $state(false);

	const handleKeyDown = e => {
		if (e.ctrlKey || e.metaKey) {
			if (e.key === "Enter") {
				e.preventDefault();
				addCardForm.requestSubmit();
			}
			if (e.key === "u" || e.key === "o") {
				e.preventDefault();
			}
		}
	}

	onMount(() => {
		frontEditor.focus();
	})
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="type-row">
	<span id="card-type-label">Type</span>
	<div class="type-segments" role="radiogroup" aria-labelledby="card-type-label">
		{#each [
			["basic", "Basic", "Basic card type: Card is scheduled following FSRS (Free Spaced Repetition Scheduler)"],
			["tactic", "Tactic", "Tactic card type: If evaluated <i>Correct</i>, card is not seen again. If evaluated <i>Incorrect</i>, card is scheduled for next day"]
		] as [value, label, description]}
			<button
				class="std-btn"
				role="radio"
				aria-checked={cardType === value}
				class:selected={cardType === value}
				onclick={() => cardType = value}
			>
				{label}
				<span class="tooltip" aria-hidden="true">{@html description}</span>
			</button>
		{/each}
	</div>
</div>
<div class="container card-surface">
	<div class="menu-bar-holder">
		<DocEditorMenuBar {menu} onAddChessboard={addChessboard} />
	</div>
	<p class="side-indicator">Front</p>
	{#if formAttemptedAndInvalid}
		<p style="color: red; margin-left: 16px; margin-top: 4px; margin-bottom: 4px;">The card must have atleast 1 non-empty text field or 1 chessboard</p>
	{/if}
	<CardSideDocEditor
		bind:this={frontEditor}
		{boardUi}
		onDocChanged={() => formAttemptedAndInvalid = false}
		onEditorFocus={handleEditorFocus}
		onEditorBlur={handleEditorBlur}
		onEditorTransaction={handleEditorRefresh}
	/>
	<!-- 4px + the container gap: the same 8px the Front label has under the
	     menu bar's hr -->
	<p class="side-indicator" style="margin-top: 4px;">Back</p>
	<CardSideDocEditor
		bind:this={backEditor}
		{boardUi}
		isBack
		onDocChanged={() => formAttemptedAndInvalid = false}
		onEditorFocus={handleEditorFocus}
		onEditorBlur={handleEditorBlur}
		onEditorTransaction={handleEditorRefresh}
	/>
	<form
		bind:this={addCardForm}
		class="add-form"
		method="POST"
		use:enhance={({ formData, cancel }) => {
			// open board editors are applied as if Ok was pressed (they stay
			// open through the submit, no visual flash)
			for (const apply of Object.values(boardUi.applyEditors)) apply();

			const front = frontEditor.getJson();
			const back = backEditor.getJson();
			if (!docHasContent(front) && !docHasContent(back)) {
				formAttemptedAndInvalid = true;
				cancel();
				return;
			}

			formData.set("front", docSideJson(front));
			formData.set("back", docSideJson(back));
			formData.set("cardType", cardType);

			return async ({ result, update }) => {
				// no invalidation: the deck context is updated by the push
				// below, a refetch's result would be discarded anyway
				await update({ invalidateAll: false })
				if (result.type !== "success") return;
				deck.cards.push(result.data.card);
				boardUi.editingIds.clear();
				boardUi.editorStates = {};
				frontEditor.clear();
				backEditor.clear();
				frontEditor.focus();
			}
		}}
	>
		<button
			class="std-btn"
			title="ctrl+enter"
		>
			Add card
		</button>
	</form>
</div>

<style>
	.container {
		margin-top: 6px;
		margin-bottom: 80px;
		/* 30px to the editors: the distance boards/text had from the card
		   edge in the block editor (card 20px + block 10px) */
		padding: 12px 30px;
		gap: 4px;
		max-width: 880px;
	}
	/* card-type bar above the card, sharing its column width */
	.type-row {
		width: 100%;
		max-width: 880px;
		margin: 17px auto 0 auto;
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 0.85rem;
		color: rgba(0, 0, 0, 0.6);
	}
	.type-segments {
		display: flex;
		gap: 4px;
	}
	/* unselected recedes grey, the selected pill is plain white — the
	   contrast alone carries the state, no accent border */
	.type-segments button {
		width: 62px;
		padding: 3px 0;
		border-radius: 999px;
		font-size: 0.85rem;
		cursor: pointer;
		position: relative;
		margin: 0;
		background-color: #e6e6e6;
		color: rgba(0, 0, 0, 0.65);
	}
	/* custom tooltip: appears after 300ms instead of the ~1s native delay
	   (a real element rather than a title attribute, so it can hold markup) */
	.type-segments button .tooltip {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		width: max-content;
		max-width: 300px;
		text-align: left;
		background-color: black;
		color: white;
		font-size: 13px;
		font-weight: 500;
		padding: 5px 10px;
		border-radius: 4px;
		opacity: 0;
		visibility: hidden;
		pointer-events: none;
		transition: opacity 100ms ease 300ms, visibility 0ms 300ms;
		/* above the sticky menu-bar holder, which the tooltip hangs over */
		z-index: 30;
	}
	.type-segments button:hover .tooltip {
		opacity: 1;
		visibility: visible;
	}
	.type-segments button.selected {
		background-color: white;
		color: black;
	}
	/* pinned to the viewport top while the card scrolls; the holder spans the
	   full card width (white, so content passes underneath cleanly) while the
	   bar's buttons start where the editors do */
	.menu-bar-holder {
		position: sticky;
		top: 0;
		z-index: 20;
		margin: -12px -30px 4px -30px;
		padding: 8px 30px 0 30px;
		background: white;
		border-radius: 8px 8px 0 0;
	}
	.side-indicator {
		margin-left: 8px;
		margin-bottom: 2px;
		font-size: 1rem;
		line-height: 1.2;
		align-self: start;
	}
	/* flush with the editors' right edge */
	.add-form {
		align-self: end;
		margin-top: 12px;
	}
</style>
