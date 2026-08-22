<script>
	import { onMount, onDestroy } from "svelte"
	import CardSideBlockEditor from "$lib/components/CardSideBlockEditor.svelte"
	import DocEditorMenuBar from "$lib/components/DocEditorMenuBar.svelte"
	import { insertChessboardBlock, insertBoardAtCaret } from "$lib/tiptap-chessboard-block/index.js"
	import { sideToDoc, docSideJsonBlocks, docHasContentBlocks, docCountBoardsBlocks, docInvalidBoardNumbersBlocks, invalidFenMessage } from "$lib/card-utils.js"

	// The add-cards editing surface for an EXISTING card: both sides as
	// block-editor documents initialized from the stored card, sharing one
	// menu bar, board-editing ui and the Cancel/Save row (placed like the
	// add-cards page's Add card button); Ctrl+Enter saves too. session
	// (optional) is a bag { boardUi, frontDoc, backDoc } owned by the host,
	// letting an in-progress edit survive host navigation.
	// showCardType: study edits a card with nothing else on screen, so the
	// type belongs in the editor. Browse keeps its own per-row control in the
	// table beside it and leaves this off.
	let { card, session = null, showCardType = false, onSave, onCancel } = $props();

	// Local until Save, like the documents: the editor has a Cancel, and a
	// type that had already been written would survive it.
	// svelte-ignore state_referenced_locally -- initial value; edits live here
	let cardType = $state(card.card_type);

	// svelte-ignore state_referenced_locally -- session is an init-time bag, never swapped
	const bag = session ?? {
		boardUi: { editingIds: new Set(), editorStates: {}, applyEditors: {}, invalidBoards: {} },
		frontDoc: null,
		backDoc: null
	};
	const boardUi = bag.boardUi;

	// svelte-ignore state_referenced_locally -- initial content only; edits live in the editors
	const initialFront = bag.frontDoc ?? sideToDoc($state.snapshot(card).front);
	// svelte-ignore state_referenced_locally
	const initialBack = bag.backDoc ?? sideToDoc($state.snapshot(card).back);

	let frontEditor = $state(), backEditor = $state();

	// board numbering across the sides (see the add-cards page)
	let frontBoards = $state(0);
	let backBoards = $state(0);
	const recount = () => {
		frontBoards = docCountBoardsBlocks(frontEditor?.getJson());
		backBoards = docCountBoardsBlocks(backEditor?.getJson());
	}
	onMount(() => {
		recount();
		// Entering edit mode focuses the front with the caret at its end (the
		// board caret when a chessboard block sits last). Never tiptap's
		// focus("end"): it resolves a text position, which on a board-last
		// document selects everything (a blue flash).
		frontEditor?.focusEnd();
	});

	// the menu-bar glue mirrors the add-cards page — see there for why every
	// handler defers a microtask
	let menu = $state({ editor: null, focused: false });
	const handleEditorFocus = editor => queueMicrotask(() => {
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
		recount();
	});

	const addChessboard = () => {
		const editor = menu.editor ?? frontEditor.getEditor();
		if (!insertBoardAtCaret(editor, boardUi)) insertChessboardBlock(editor, boardUi);
	}

	let invalidFenNumbers = $state([]);
	let noContentAttempted = $state(false);
	const clearErrors = () => {
		invalidFenNumbers = [];
		noContentAttempted = false;
	}

	// same gating as the add-cards submit: open editors are applied as if Ok
	// was pressed; an invalid FEN or an all-empty card blocks the save
	export const save = async () => {
		for (const apply of Object.values(boardUi.applyEditors)) apply();
		const front = frontEditor.getJson();
		const back = backEditor.getJson();
		const frontCount = docCountBoardsBlocks(front);
		invalidFenNumbers = [
			...docInvalidBoardNumbersBlocks(front, 0, boardUi),
			...docInvalidBoardNumbersBlocks(back, frontCount, boardUi)
		];
		if (invalidFenNumbers.length > 0) return;
		if (!docHasContentBlocks(front) && !docHasContentBlocks(back)) {
			noContentAttempted = true;
			return;
		}
		await onSave(docSideJsonBlocks(front), docSideJsonBlocks(back), cardType);
	}

	// with a host-owned session the unsaved documents survive navigation
	onDestroy(() => {
		if (!session) return;
		bag.frontDoc = frontEditor?.getJson() ?? bag.frontDoc;
		bag.backDoc = backEditor?.getJson() ?? bag.backDoc;
	});

	const handleKeyDown = e => {
		if (e.ctrlKey || e.metaKey) {
			if (e.key === "Enter") {
				e.preventDefault();
				save();
			}
			if (e.key === "u" || e.key === "o" || e.key === "k") {
				e.preventDefault();
			}
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="menu-holder">
	<DocEditorMenuBar {menu} onAddChessboard={addChessboard} />
</div>
<p class="side-indicator">Front</p>
{#if invalidFenNumbers.length > 0}
	<p class="edit-error">{invalidFenMessage(invalidFenNumbers)}</p>
{/if}
{#if noContentAttempted}
	<p class="edit-error">The card must have atleast 1 non-empty text field or 1 chessboard</p>
{/if}
<div class="editor-wrap" class:show-board-numbers={frontBoards + backBoards > 1} style="--board-offset: 0">
	<CardSideBlockEditor
		bind:this={frontEditor}
		{boardUi}
		initialDoc={initialFront}
		onDocChanged={clearErrors}
		onEditorFocus={handleEditorFocus}
		onEditorBlur={handleEditorBlur}
		onEditorTransaction={handleEditorRefresh}
	/>
</div>
<p class="side-indicator" style="margin-top: 14px;">Back</p>
<div class="editor-wrap" class:show-board-numbers={frontBoards + backBoards > 1} style="--board-offset: {frontBoards}">
	<CardSideBlockEditor
		bind:this={backEditor}
		{boardUi}
		isBack
		initialDoc={initialBack}
		onDocChanged={clearErrors}
		onEditorFocus={handleEditorFocus}
		onEditorBlur={handleEditorBlur}
		onEditorTransaction={handleEditorRefresh}
	/>
</div>
<div class="edit-actions">
	{#if showCardType}
		<span id="edit-card-type-label">Type</span>
		<div class="type-segments" role="radiogroup" aria-labelledby="edit-card-type-label">
			{#each [["basic", "Basic"], ["tactic", "Tactic"]] as [value, label]}
				<button
					class="std-btn"
					role="radio"
					aria-checked={cardType === value}
					class:selected={cardType === value}
					onclick={() => cardType = value}
				>
					{label}
				</button>
			{/each}
		</div>
		<span class="actions-spacer"></span>
	{/if}
	<button class="std-btn" onclick={onCancel}>Cancel</button>
	<button class="std-btn" title="ctrl+enter" onclick={save}>Save</button>
</div>

<style>
	/* flush with the editors' right edge, like add-cards' Add card; with the
	   type shown the row spans instead, type at the left and the buttons
	   still at the right */
	.edit-actions {
		align-self: end;
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 12px;
		font-size: 0.85rem;
		color: rgba(0, 0, 0, 0.6);
	}
	.edit-actions:has(.type-segments) {
		align-self: stretch;
	}
	.actions-spacer {
		flex: 1;
	}
	/* the add-cards pills: unselected recedes grey, the selected is plain
	   white against it */
	.type-segments {
		display: flex;
		gap: 4px;
	}
	.type-segments .std-btn {
		padding: 4px 10px;
		border-radius: 999px;
		color: rgba(0, 0, 0, 0.55);
	}
	.type-segments .std-btn.selected {
		background-color: white;
		border-color: darkgrey;
		color: #222;
		font-weight: 500;
	}
	.menu-holder {
		align-self: stretch;
		margin-bottom: 4px;
	}
	.editor-wrap {
		align-self: stretch;
	}
	.side-indicator {
		margin-left: 3px;
		margin-bottom: 1px;
		font-size: 1rem;
		line-height: 1.2;
		align-self: start;
	}
	.edit-error {
		color: red;
		margin: 4px 0 4px 16px;
	}
</style>
