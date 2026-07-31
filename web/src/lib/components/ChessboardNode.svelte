<script>
	import { tick } from "svelte"
	import Chessboard from "$lib/components/Chessboard.svelte"
	import ChessboardEditor from "$lib/components/ChessboardEditor.svelte"
	import EyeIcon from "$lib/icons/Eye.svelte"
	import EyeOffIcon from "$lib/icons/EyeOff.svelte"
	import { isValidFen } from "$lib/isValidFen.js"

	// The Svelte face of a chessboard PM node (mounted by tiptap-chessboard's
	// node view). board comes from the node's attrs; every change goes back out
	// through onUpdate as a whole-object replacement, which dispatches an attr
	// transaction — so undo covers board edits. An open board editor syncs its
	// working state out the same way but outside history (the document — and
	// everything derived from it, like the duplicate check — follows each edit
	// live); Cancel restores the opening snapshot, Save re-records the whole
	// edit as one undo step.
	// ui: shared { editingIds, editorStates, applyEditors } living outside the
	// node views, so an open editor survives the view being destroyed and
	// recreated (PM does that on drags) and the page can apply open editors on
	// submit.
	let { board, isBack, ui, onUpdate, onEditingChange, onCaretAfter, onDuplicate = null, boardMinWidth = "380px" } = $props();

	// svelte-ignore state_referenced_locally -- seeding local state from the shared set on mount is the point
	let isEditing = $state(ui.editingIds.has(board.id));
	// a board born with its editor open (insert) never passes openEditor: its
	// Cancel snapshot is the freshly inserted board itself. ??= so a node view
	// recreated mid-edit (drags) keeps the true opening state instead
	// svelte-ignore state_referenced_locally -- the mount-time board is the snapshot wanted
	if (isEditing) (ui.savedBoards ??= {})[board.id] ??= $state.snapshot(board);
	// The initial report is deferred one microtask (still pre-paint): it runs
	// during render, where a parent mutating its state would throw. Open/close
	// report synchronously — the wrapper's full-row class must change in the
	// same frame as the editor/board swap or the new content lays out in the
	// old width for a beat (the v1 jank).
	queueMicrotask(() => onEditingChange(isEditing));

	let editorRef = $state();
	let editBtn = $state();

	const openEditor = () => {
		// the state to return to on Cancel — kept in the shared ui so it
		// survives the node view being destroyed and recreated mid-edit
		(ui.savedBoards ??= {})[board.id] = $state.snapshot(board);
		ui.editingIds.add(board.id);
		onEditingChange(true);
		isEditing = true;
		// the document keeps focus with the caret parked (hidden) at the
		// board's right, so typing, Enter and arrows keep working exactly
		// like outside an editor; hosts without a virtual caret (v1) have
		// nothing to park
		if (onCaretAfter) onCaretAfter();
	}

	// closing unmounts the button that was focused, which would drop focus to
	// <body>; like v1, the board's Edit button takes the editor's place —
	// unless the host asked for the caret instead (onCaretAfter)
	const closeEditor = async () => {
		openInMoves = false;
		ui.editingIds.delete(board.id);
		delete ui.editorStates[board.id];
		delete ui.savedBoards?.[board.id];
		onEditingChange(false);
		isEditing = false;
		await tick();
		if (onCaretAfter) onCaretAfter();
		else editBtn?.focus({ preventScroll: true });
	}

	// on submit the page applies open editors as if Ok was pressed, without
	// closing them (same contract as CardSideEditor.applyOpenEditors)
	$effect(() => {
		if (!isEditing) return;
		ui.applyEditors[board.id] = () => {
			const data = editorRef?.getBoardData();
			if (data) onUpdate({ ...data, id: board.id });
		}
		return () => delete ui.applyEditors[board.id];
	});

	// Inline FEN, committed on change (blur/Enter) rather than per keystroke
	// so undo history holds one step per edit. v1's contract: a valid FEN
	// commits and drops the recorded line (the moves no longer apply);
	// invalid text persists on the board as fenInput — shown red, carried
	// into the editor, and caught by the page's submit gating.
	let fenDraft = $state(null);
	const shownFen = $derived(fenDraft ?? board.fenInput ?? board.fen);
	const fenInvalid = $derived((fenDraft ?? board.fenInput) != null && !isValidFen(fenDraft ?? board.fenInput));

	const commitFen = value => {
		const next = { ...board };
		if (board.moves.length > 0) {
			next.moves = [];
			next.annotations = board.annotations[0] ? { 0: board.annotations[0] } : {};
			next.solutionAnnotations = board.solutionAnnotations?.[0] ? { 0: board.solutionAnnotations[0] } : {};
			next.solutionFrom = null;
		}
		if (isValidFen(value)) {
			next.fen = value;
			next.fenInput = undefined;
		} else {
			next.fenInput = value;
		}
		fenDraft = null;
		onUpdate(next);
	}

	// A pasted FEN is a position from elsewhere: it lands on the board at once
	// rather than waiting for blur, and the editor then opens on the moves
	// stage — there is nothing left to set up. Typing the same characters keeps
	// the commit-on-change contract, so the flag comes from the paste event.
	let fenPasted = false;
	let openInMoves = $state(false);
	const handleFenInput = e => {
		fenDraft = e.target.value;
		if (!fenPasted) return;
		fenPasted = false;
		openInMoves = isValidFen(e.target.value);
		commitFen(e.target.value);
	}

	// v1's eye: the collapsed front board previews the turned card by
	// default; toggling off shows the student's pre-turn view
	let showBack = $state(true);

	// v1: t toggles an open board editor's front/back recording layer when
	// focus is inside it (never while typing)
	const handleLayerShortcut = e => {
		if (!isEditing) return;
		if ((e.key !== "t" && e.key !== "T") || e.ctrlKey || e.metaKey || e.altKey) return;
		if (e.target.closest?.("input, textarea, [contenteditable='true']")) return;
		if (!e.target.closest?.(`[data-board-id="${board.id}"]`)) return;
		editorRef?.toggleAnswer();
		e.preventDefault();
	}
</script>

<svelte:window onkeydown={handleLayerShortcut} />

{#if isEditing}
	<ChessboardEditor
		bind:this={editorRef}
		board={{ ...board, fenInput: fenDraft ?? board.fenInput ?? undefined }}
		boardOnBack={isBack}
		startInMoves={openInMoves}
		onFenValidityChange={valid => {
			if (!ui.invalidBoards) return;
			if (valid) delete ui.invalidBoards[board.id];
			else ui.invalidBoards[board.id] = true;
		}}
		restore={ui.editorStates[board.id]}
		persistState={state => {
			if (ui.editingIds.has(board.id)) ui.editorStates[board.id] = state;
		}}
		onLiveChange={data => onUpdate({ ...data, id: board.id }, { history: false })}
		onSave={data => {
			fenDraft = null;
			// the live syncs kept the document current but out of history; put
			// the opening state back first, so this one recorded step spans the
			// whole edit and a single undo reverts it
			const saved = ui.savedBoards?.[board.id];
			if (saved) onUpdate(saved, { history: false });
			onUpdate({ ...data, id: board.id });
			closeEditor();
		}}
		onCancel={() => {
			fenDraft = null;
			const saved = ui.savedBoards?.[board.id];
			if (saved) onUpdate(saved, { history: false });
			closeEditor();
		}}
	/>
{:else}
	<div class="board-area">
		<Chessboard {board} minWidth={boardMinWidth} flushBottom authorView={!isBack} revealed={isBack ? true : showBack}>
			<div class="button-row">
				<input
					class:invalid-fen={fenInvalid}
					value={shownFen}
					oninput={handleFenInput}
					onpaste={() => fenPasted = true}
					onchange={e => commitFen(e.target.value)}
					onkeydown={e => { if (e.key === "Enter") e.target.blur() }}
				/>
				{#if !isBack}
				<button
					class="show-back-btn"
					aria-pressed={showBack}
					onclick={() => showBack = !showBack}
				>
					{#if showBack}<EyeIcon />{:else}<EyeOffIcon />{/if}
					<span>Back</span>
				</button>
			{/if}
			{#if onDuplicate}
				<button onclick={onDuplicate}>Duplicate</button>
			{/if}
			<button class="edit-btn" bind:this={editBtn} onclick={openEditor}>Edit</button>
			</div>
		</Chessboard>
	</div>
{/if}

<style>
	.board-area {
		position: relative;
		display: flex;
		flex-direction: column;
	}
	.button-row {
		/* overlap onto the board's bottom edge, covering the fractional-zoom
		   hairline seam (same as CardSideEditor) */
		margin: -1px 0 0 0;
		position: relative;
	}
	.button-row > * {
		border-radius: 0;
	}
	.button-row > input {
		flex: 1 1 auto;
		min-width: 0;
	}
	/* the FEN field is a text input, not a button: the row's shared button
	   mechanics (hover lift, press dip) don't apply to it */
	.button-row > input:hover,
	.button-row > input:active {
		border: 1px solid lightgrey;
		border-bottom: 1px solid darkgrey;
		background-color: #f5f5f5;
		box-shadow: none;
		transform: none;
	}
	.button-row > input:focus {
		position: relative;
		z-index: 1;
	}
	.button-row > input.invalid-fen {
		border: 1px solid #c00;
		outline-color: #c00;
	}
	.button-row > button {
		padding: 3px 16px;
	}
	/* bordered boards overlap deeper so no zoom factor can expose a seam */
	:global(.board-cell:has(.board.black-border)) .button-row,
	:global(.board-node:has(.board.black-border)) .button-row {
		margin-top: -2px;
	}
	/* front rows (with the eye): the FEN gets half the bar, the buttons
	   fill the rest at natural widths (v1) */
	.button-row:has(> .show-back-btn) > input {
		flex: 0 1 45%;
		box-sizing: border-box;
	}
	.button-row:has(> .show-back-btn) > button {
		flex: 1 1 auto;
		min-width: max-content;
		box-sizing: border-box;
		padding: 3px 12px;
		white-space: nowrap;
	}
	/* fixed width so the eye toggles without shifting the row (v1) */
	.button-row .show-back-btn {
		width: 76px;
		padding: 3px 0;
		display: flex;
		gap: 5px;
		align-items: center;
		justify-content: center;
		white-space: nowrap;
	}
</style>
