<script>
	import { onMount, onDestroy } from "svelte"
	import CardSideBlockEditor from "$lib/components/CardSideBlockEditor.svelte"
	import DocEditorMenuBar from "$lib/components/DocEditorMenuBar.svelte"
	import MoveRefDialog from "$lib/components/MoveRefDialog.svelte"
	import { insertChessboardBlock, insertBoardAtCaret } from "$lib/tiptap-chessboard-block/index.js"
	import { createTabTrap } from "$lib/tab-trap.js"
	import { sideToDoc, docSideJsonBlocks, docHasContentBlocks, docCountBoardsBlocks, docHasBoardPairBlocks, docBoardsBlocks, docInvalidBoardNumbersBlocks, invalidFenMessage } from "$lib/card-utils.js"

	// The add-cards editing surface for an EXISTING card: both sides as
	// block-editor documents initialized from the stored card, sharing one
	// menu bar, board-editing ui and the Cancel/Save row (placed like the
	// add-cards page's Add card button); Ctrl+Enter saves too. session
	// (optional) is a bag { boardUi, frontDoc, backDoc } owned by the host,
	// letting an in-progress edit survive host navigation.
	let { card, session = null, onSave, onCancel } = $props();

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
	// ...and which sides put two boards on a row, the card's two board-layout
	// questions (side-alignment.js): a pair ANYWHERE on the card takes the solo
	// size away from every lone board, and a pair on a SIDE pins that side's
	// lone boards left, where they line up with the column above or below.
	let frontPair = $state(false);
	let backPair = $state(false);
	let boardsAllAlone = $derived(!frontPair && !backPair);
	const recount = () => {
		frontBoards = docCountBoardsBlocks(frontEditor?.getJson());
		backBoards = docCountBoardsBlocks(backEditor?.getJson());
		frontPair = docHasBoardPairBlocks(frontEditor?.getJson());
		backPair = docHasBoardPairBlocks(backEditor?.getJson());
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

	// moves written into the text, wired to a board — the add-cards page's
	// panel, on the same terms (see there)
	let movesOpen = $state(false);
	let movesBoards = $state([]);
	let movesEditor = null;
	const cardBoards = () =>
		[...docBoardsBlocks(frontEditor?.getJson()), ...docBoardsBlocks(backEditor?.getJson())]
			.map((board, i) => ({ number: i + 1, fen: board.fen, moves: board.moves ?? [] }));
	const openMoves = () => {
		movesEditor = menu.editor ?? frontEditor?.getEditor();
		movesBoards = cardBoards();
		movesOpen = movesBoards.length > 0;
	}
	const insertMoves = content => {
		movesOpen = false;
		movesEditor?.chain().focus().insertContent(content).run();
	}

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

	// --- tab trap ---
	// the add-cards page's cycle, with its Add card replaced by the two
	// buttons that end this edit: front, back, Cancel, Save
	let container;
	let cancelBtn = $state(), saveBtn = $state();

	const trapStops = () => {
		const [front, back] = [...container.querySelectorAll(".editor-wrap")]
			.map(w => w.querySelector(".text-area > .ProseMirror"));
		return [
			{ el: front, focus: () => frontEditor.focusEnd() },
			{ el: back, focus: () => backEditor.focusEnd() },
			{ el: cancelBtn, focus: () => cancelBtn.focus() },
			{ el: saveBtn, focus: () => saveBtn.focus() }
		].filter(stop => stop.el && !stop.el.disabled && stop.el.offsetParent !== null);
	}

	const { handleKeydown: handleTrapKeydown, handleFocusIn } = createTabTrap(trapStops);

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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- the trap needs an element to listen on, but the host lays these out as
     its own flex children: display: contents keeps the box out of the way -->
<div
	class="trap-root"
	bind:this={container}
	onkeydowncapture={handleTrapKeydown}
	onfocusin={handleFocusIn}
>
<div class="menu-holder">
	<DocEditorMenuBar
		{menu}
		onAddChessboard={addChessboard}
		onInsertMoves={openMoves}
		movesDisabled={frontBoards + backBoards === 0}
	/>
	{#if movesOpen}
		<MoveRefDialog
			boards={movesBoards}
			onInsert={insertMoves}
			onClose={() => movesOpen = false}
		/>
	{/if}
</div>
<p class="side-indicator">Front</p>
{#if invalidFenNumbers.length > 0}
	<p class="edit-error">{invalidFenMessage(invalidFenNumbers)}</p>
{/if}
{#if noContentAttempted}
	<p class="edit-error">The card must have atleast 1 non-empty text field or 1 chessboard</p>
{/if}
<div class="editor-wrap" class:show-board-numbers={frontBoards + backBoards > 1} class:boards-solo={boardsAllAlone} class:boards-left={frontPair} style="--board-offset: 0">
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
<div class="editor-wrap" class:show-board-numbers={frontBoards + backBoards > 1} class:boards-solo={boardsAllAlone} class:boards-left={backPair} style="--board-offset: {frontBoards}">
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
	<button class="std-btn" bind:this={cancelBtn} onclick={onCancel}>Cancel</button>
	<button class="std-btn" bind:this={saveBtn} title="ctrl+enter" onclick={save}>Save</button>
</div>
</div>

<style>
	.trap-root {
		display: contents;
	}
	/* flush with the editors' right edge, like add-cards' Add card */
	.edit-actions {
		align-self: end;
		display: flex;
		gap: 8px;
		margin-top: 12px;
	}
	.menu-holder {
		/* the moves panel hangs from this */
		position: relative;
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
