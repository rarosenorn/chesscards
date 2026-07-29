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
	let { card, session = null, onSave, onCancel } = $props();

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
		// Entering edit mode focuses the front, whose caret already sits
		// parked at the end of its document. Plain focus(), NOT
		// focus("end"): tiptap resolves that to a text position, which on a
		// board-last document selects everything (a blue flash).
		frontEditor?.focus();
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
		await onSave(docSideJsonBlocks(front), docSideJsonBlocks(back));
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
	<button class="std-btn" onclick={onCancel}>Cancel</button>
	<button class="std-btn" title="ctrl+enter" onclick={save}>Save</button>
</div>

<style>
	/* flush with the editors' right edge, like add-cards' Add card */
	.edit-actions {
		align-self: end;
		display: flex;
		gap: 8px;
		margin-top: 12px;
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
