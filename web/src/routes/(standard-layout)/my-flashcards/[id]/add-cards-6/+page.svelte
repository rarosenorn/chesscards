<script>
	// Experimental "Add cards 6": the split-card trial. Each side is two
	// columns — text left at a readable measure, boards right — on a wider
	// card, collapsing to stacked when narrow. The text editors are plain
	// tiptap documents (no embedded boards); each side's board column is one
	// chessboards-block worth of boards with its own + Chessboard button, the
	// per-board FEN/Duplicate/Edit rows of the earlier editors. Submit writes
	// the ordinary stored format (one text block + one chessboards block per
	// side), so storage/study/browse need no changes. Deliberately minimal
	// like the other trials: no tab trap, no draft persistence, no FEN gating.
	import { getContext, onMount } from "svelte"
	import { enhance } from "$app/forms"
	import { browser } from "$app/environment"
	import { page } from "$app/state"
	import CardSideDocEditor from "$lib/components/CardSideDocEditor.svelte"
	import DocEditorMenuBar from "$lib/components/DocEditorMenuBar.svelte"
	import ChessboardNode from "$lib/components/ChessboardNode.svelte"
	import { newBoard, boardForJson, docSideJson, docHasContent } from "$lib/card-utils.js"
	import { stageLabel } from "$lib/stages.js"
	import { loadStageId, saveStageId, loadCardType, saveCardType, DEFAULT_CARD_TYPE } from "$lib/add-cards-draft.js"

	const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

	// the shared deck context (layout); new cards are pushed into it so
	// browse/study see them without a reload
	const deck = getContext("deck");
	const deckId = page.params.id;

	// Anki-style modes shared with the main editor: type and chapter stick
	// per deck
	let cardType = $state(browser ? loadCardType(deckId) : DEFAULT_CARD_TYPE);
	const chooseCardType = value => {
		cardType = value;
		saveCardType(deckId, value);
	}
	let stagesSorted = $derived([...deck.stages].sort((a, b) => a.position - b.position));
	let stageId = $state(browser ? loadStageId(deckId) : null);
	let validStageId = $derived(
		stagesSorted.some(stage => stage.id === stageId)
			? stageId
			: stagesSorted[stagesSorted.length - 1]?.id
	);
	const chooseStage = value => {
		stageId = value;
		saveStageId(deckId, value);
	}

	// shared board-editing state (see ChessboardNode.svelte): one bag serves
	// both sides, and the submit applies open editors through it
	const boardUi = { editingIds: new Set(), editorStates: {}, applyEditors: {} };

	// each side's board column — one chessboards block worth of boards
	let frontBoards = $state([]);
	let backBoards = $state([]);
	// which boards hold an open editor, for the column's layout
	let editingBoards = $state({});

	const boardsOf = side => side === "front" ? frontBoards : backBoards;

	const addBoard = side => {
		const board = newBoard(startFen);
		// born with its editor open, like an inserted board in the block editor
		boardUi.editingIds.add(board.id);
		boardsOf(side).push(board);
	}

	const updateBoard = (side, id, next) => {
		const list = boardsOf(side);
		const index = list.findIndex(b => b.id === id);
		if (index >= 0) list[index] = next;
	}

	const duplicateBoard = (side, id) => {
		const list = boardsOf(side);
		const index = list.findIndex(b => b.id === id);
		if (index < 0) return;
		list.splice(index + 1, 0, { ...$state.snapshot(list[index]), id: crypto.randomUUID() });
	}

	const removeBoard = (side, id) => {
		boardUi.editingIds.delete(id);
		delete boardUi.editorStates[id];
		delete boardUi.applyEditors[id];
		delete editingBoards[id];
		const list = boardsOf(side);
		const index = list.findIndex(b => b.id === id);
		if (index >= 0) list.splice(index, 1);
	}

	// bound to the two CardSideDocEditor instances
	let frontEditor, backEditor;
	let addCardForm;

	// The shared menu bar acts on whichever editor is focused (see Add cards
	// 3, where this pattern comes from); lastSide routes the bar's board
	// button to the right column
	let menu = $state({ editor: null, focused: false });
	let lastSide = "front";
	const handleEditorFocus = (editor, side) => queueMicrotask(() => {
		lastSide = side;
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

	// the menu bar's board button files into the last-focused side's column
	const addChessboardFromBar = () => addBoard(lastSide);

	let formAttemptedAndInvalid = $state(false);

	// the stored side: the doc's text block (if any) plus the column's boards
	// as one chessboards block
	const sideJson = (doc, boards) => {
		const side = JSON.parse(docSideJson(doc));
		if (boards.length > 0) {
			side.push({ type: "chessboards", content: boards.map(b => boardForJson($state.snapshot(b))) });
		}
		return JSON.stringify(side);
	}

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

{#snippet boardColumn(side, boards)}
	<div class="board-col">
		{#each boards as board (board.id)}
			<div class="board-container" class:board-container-editing={editingBoards[board.id]}>
				<button
					class="delete-board-btn"
					aria-label="Delete board"
					onclick={() => removeBoard(side, board.id)}
				>×</button>
				<ChessboardNode
					{board}
					isBack={side === "back"}
					ui={boardUi}
					boardMinWidth="320px"
					onUpdate={next => updateBoard(side, board.id, next)}
					onEditingChange={value => {
						if (value) editingBoards[board.id] = true;
						else delete editingBoards[board.id];
					}}
					onDuplicate={() => duplicateBoard(side, board.id)}
				/>
			</div>
		{/each}
		<button class="white-btn add-chessboard-btn" onclick={() => addBoard(side)}>
			+ Chessboard
		</button>
	</div>
{/snippet}

<div class="type-row">
	{#if stagesSorted.length > 1}
		<label class="stage-picker">
			Chapter
			<select value={validStageId} onchange={e => chooseStage(e.currentTarget.value)}>
				{#each stagesSorted as stage (stage.id)}
					<option value={stage.id}>{stageLabel(stage)}</option>
				{/each}
			</select>
		</label>
	{/if}
	<span id="card-type-label">Type</span>
	<div class="type-segments" role="radiogroup" aria-labelledby="card-type-label">
		{#each [
			["basic", "Basic"],
			["tactic", "Tactic"]
		] as [value, label]}
			<button
				class="std-btn"
				role="radio"
				aria-checked={cardType === value}
				class:selected={cardType === value}
				onclick={() => chooseCardType(value)}
			>
				{label}
			</button>
		{/each}
	</div>
</div>
<div class="container card-surface">
	<div class="menu-bar-holder">
		<DocEditorMenuBar {menu} onAddChessboard={addChessboardFromBar} />
	</div>
	<p class="side-indicator">Front</p>
	{#if formAttemptedAndInvalid}
		<p class="invalid-note">The card must have atleast 1 non-empty text field or 1 chessboard</p>
	{/if}
	<div class="side-row" class:has-open-editor={frontBoards.some(b => editingBoards[b.id])}>
		<div class="text-col">
			<CardSideDocEditor
				bind:this={frontEditor}
				{boardUi}
				onDocChanged={() => formAttemptedAndInvalid = false}
				onEditorFocus={editor => handleEditorFocus(editor, "front")}
				onEditorBlur={handleEditorBlur}
				onEditorTransaction={handleEditorRefresh}
			/>
		</div>
		{@render boardColumn("front", frontBoards)}
	</div>
	<p class="side-indicator" style="margin-top: 4px;">Back</p>
	<div class="side-row" class:has-open-editor={backBoards.some(b => editingBoards[b.id])}>
		<div class="text-col">
			<CardSideDocEditor
				bind:this={backEditor}
				{boardUi}
				isBack
				onDocChanged={() => formAttemptedAndInvalid = false}
				onEditorFocus={editor => handleEditorFocus(editor, "back")}
				onEditorBlur={handleEditorBlur}
				onEditorTransaction={handleEditorRefresh}
			/>
		</div>
		{@render boardColumn("back", backBoards)}
	</div>
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
			if (!docHasContent(front) && !docHasContent(back)
				&& frontBoards.length === 0 && backBoards.length === 0) {
				formAttemptedAndInvalid = true;
				cancel();
				return;
			}

			formData.set("front", sideJson(front, frontBoards));
			formData.set("back", sideJson(back, backBoards));
			formData.set("cardType", cardType);
			formData.set("stageId", validStageId ?? "");

			return async ({ result, update }) => {
				// no invalidation: the deck context is updated by the push
				// below, a refetch's result would be discarded anyway
				await update({ invalidateAll: false })
				if (result.type !== "success") return;
				deck.cards.push(result.data.card);
				boardUi.editingIds.clear();
				boardUi.editorStates = {};
				editingBoards = {};
				frontBoards = [];
				backBoards = [];
				frontEditor.clear();
				backEditor.clear();
				frontEditor.focus();
			}
		}}
	>
		<button class="std-btn" title="ctrl+enter">Add card</button>
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
		/* the wide card the split layout buys: text at a readable measure,
		   boards with real room */
		max-width: 1240px;
	}
	/* chapter/type bar above the card, sharing its column width */
	.type-row {
		width: 100%;
		max-width: 1240px;
		margin: 17px auto 0 auto;
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 0.85rem;
		color: rgba(0, 0, 0, 0.6);
	}
	.stage-picker {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-right: 12px;
	}
	.stage-picker select {
		font-size: 0.85rem;
		padding: 3px 6px;
		border: 1px solid rgba(0, 0, 0, 0.25);
		border-radius: 4px;
		background-color: white;
		cursor: pointer;
	}
	.type-segments {
		display: flex;
		gap: 4px;
	}
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
	.type-segments button.selected {
		background-color: white;
		color: black;
	}
	/* pinned to the viewport top while the card scrolls (see Add cards 3) */
	.menu-bar-holder {
		position: sticky;
		top: 0;
		z-index: 20;
		margin: -12px -30px 4px -30px;
		padding: 8px 30px 0 30px;
		background: white;
		border-radius: 8px 8px 0 0;
	}
	/* the rule under the bar stops with the text column instead of crossing
	   the board column (the bar's own border spans everything) */
	.menu-bar-holder :global(.fixed-menu) {
		border-bottom: none;
		position: relative;
	}
	.menu-bar-holder :global(.fixed-menu)::after {
		content: "";
		position: absolute;
		left: 0;
		bottom: 0;
		width: min(48ch, 100%);
		border-bottom: 1px solid #ddd;
	}
	.side-indicator {
		margin-left: 8px;
		margin-bottom: 2px;
		font-size: 1rem;
		line-height: 1.2;
		align-self: start;
	}
	.invalid-note {
		color: red;
		margin: 4px 0 4px 16px;
	}
	/* The side's two columns: text at a readable measure, boards taking the
	   rest. minmax(0, ...) lets the text column actually shrink; the board
	   column owns whatever the measure leaves. */
	.side-row {
		display: grid;
		grid-template-columns: minmax(260px, 48ch) minmax(420px, 1fr);
		gap: 14px;
		align-items: start;
		width: 100%;
	}
	.text-col {
		min-width: 0;
	}
	/* boards hug the text column rather than centering in their cell, so the
	   two columns read as one card */
	.board-col {
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
	}
	.board-container {
		position: relative;
		width: 100%;
		max-width: 580px;
	}
	/* An open board editor needs the whole card: the side stacks (text above,
	   boards below) for as long as it is open, and the editing container
	   takes its natural width. */
	.side-row.has-open-editor {
		grid-template-columns: minmax(0, 1fr);
	}
	.board-container-editing {
		width: 100%;
		max-width: none;
	}
	.delete-board-btn {
		position: absolute;
		top: 3px;
		right: 3px;
		z-index: 1;
		display: flex;
		justify-content: center;
		align-items: center;
		height: 21px;
		width: 21px;
		background-color: gainsboro;
		border: 1px solid black;
		border-radius: 4px;
		cursor: pointer;
	}
	.add-chessboard-btn {
		align-self: stretch;
	}
	.add-form {
		align-self: end;
		margin-top: 12px;
	}
	/* narrow displays stack the columns, text first */
	@media (max-width: 1000px) {
		.side-row {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
