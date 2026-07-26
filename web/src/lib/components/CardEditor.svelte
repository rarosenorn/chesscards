<script>
	// Experimental single-list card editor (the "Add cards 2" trial): one
	// column of blocks, each marked Front (shown from the start) or Back
	// (revealed when the card is turned) by the pill at its top-right,
	// instead of separate front and back sides. On save the page splits the
	// list back into front/back, so the stored cards stay ordinary
	// front/back cards.
	import { tick } from "svelte"
	import { flip } from "svelte/animate"
	import { dndzone, TRIGGERS, SHADOW_ITEM_MARKER_PROPERTY_NAME } from "svelte-dnd-action"
	import TextEditor from "$lib/components/TextEditor.svelte"
	import Chessboard from "$lib/components/Chessboard.svelte"
	import ChessboardEditor from "$lib/components/ChessboardEditor.svelte"
	import CrossIcon from "$lib/icons/Cross.svelte"
	import EyeIcon from "$lib/icons/Eye.svelte"
	import EyeOffIcon from "$lib/icons/EyeOff.svelte"
	import { boardsBefore, newBoard, syncTextBlocks } from "$lib/card-utils.js"
	import { isValidFen } from "$lib/isValidFen.js"

	// dnd: shared drag/editing state object (createCardDnd), kept in the
	// page's draft so open board editors survive tab navigation
	let { blocks, showBoardNumbers = false, dnd: cardDnd } = $props();

	// board id -> whether its collapsed view shows the turned card (back
	// moves/annotations included); defaults on, toggle off for the
	// student's pre-turn view
	const showBackBoards = $state({});

	// board id -> mounted ChessboardEditor instance, for applyOpenEditors
	const boardEditors = {};

	// Applies every open board editor, as if Ok was pressed — without closing
	// them, so a submit causes no editor->board flash; the editors disappear
	// with the rest of the card when the caller resets it. A pending invalid
	// FEN survives as the board's fenInput for the card validators to catch.
	export const applyOpenEditors = () => {
		for (const block of blocks) {
			if (block.type !== "chessboards") continue;
			for (const board of block.content) {
				const data = isEditing(board.id) && boardEditors[board.id]?.getBoardData();
				if (!data) continue;
				// mutate in place: replacing the array item makes the keyed
				// each reconcile and flip-animate a size change
				Object.assign(board, data);
			}
		}
	}

	const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

	const isEditing = boardId => cardDnd.editingBoards.includes(boardId);

	// a drag's shadow item is a copy holding the library's placeholder id — it
	// renders as an empty sized box, never as an open editor
	const showsEditor = board =>
		isEditing(board.id) && !board[SHADOW_ITEM_MARKER_PROPERTY_NAME];

	// Layout-wise (full-row + order) a shadow must stand in for the dragged
	// board exactly: when the dragged board's editor is open, its gap keeps the
	// editor's full-width row. Otherwise visual order diverges from DOM order
	// and both the drop position and the reorder detection go wrong.
	const layoutAsEditor = board =>
		board[SHADOW_ITEM_MARKER_PROPERTY_NAME] ? cardDnd.dragEditing : showsEditor(board);

	const openEditor = boardId => {
		if (!isEditing(boardId)) cardDnd.editingBoards.push(boardId);
	}

	// Same validation as the board editor's FEN input: only a valid FEN is
	// committed to board.fen, so the board keeps rendering its last valid
	// position. Invalid text stays in board.fenInput (present <=> pending
	// invalid text) — shown red, carried into the editor when opened, and
	// caught by the card validators on submit. It is client-only state;
	// getSideJson never picks it up.
	// Editing also drops the recorded line, exactly like changing the
	// position in the editor: the moves no longer apply, so they and their
	// later-position annotations go (both layers keep position 0).
	const setBoardFen = (board, value) => {
		if (board.moves.length > 0) {
			board.moves = [];
			board.annotations = board.annotations[0] ? { 0: board.annotations[0] } : {};
			board.solutionAnnotations = board.solutionAnnotations?.[0] ? { 0: board.solutionAnnotations[0] } : {};
			board.solutionFrom = null;
		}
		if (isValidFen(value)) {
			board.fen = value;
			board.fenInput = undefined;
		} else {
			board.fenInput = value;
		}
	}

	const closeEditor = boardId => {
		cardDnd.editingBoards = cardDnd.editingBoards.filter(id => id !== boardId);
		delete cardDnd.editorStates[boardId];
	}

	// Save/Cancel unmount the button that was focused, which would drop focus
	// to <body> (and knock keyboard users out of the add-cards tab cycle);
	// focus the board's Edit button, which takes the editor's place
	const closeEditorAndRefocus = async boardId => {
		closeEditor(boardId);
		await tick();
		document.querySelector(`[data-board-id="${boardId}"] .edit-btn`)?.focus();
	}

	const addTextBlock = async () => {
		blocks.push({ id: crypto.randomUUID(), type: "text", textEditor: null, answer: false });
		// through the $state proxy, not the pushed literal: bind:this lands on
		// the proxied block
		const block = blocks[blocks.length - 1];
		await tick();
		block.textEditor?.focus();
	}

	// a freshly created board opens its editor with the board itself focused
	// (not the FEN input — focusing it scrolls the page too far down)
	const focusNewBoardEditor = async boardId => {
		await tick();
		document.querySelector(`[data-board-id="${boardId}"] .board`)?.focus();
	}

	const addChessboardBlock = () => {
		const board = newBoard(startFen);
		blocks.push({ id: crypto.randomUUID(), type: "chessboards", content: [board], answer: false });
		openEditor(board.id);
		focusNewBoardEditor(board.id);
	}

	const addChessboard = blockIndex => {
		const board = newBoard(startFen);
		blocks[blockIndex].content.push(board);
		openEditor(board.id);
		focusNewBoardEditor(board.id);
	}

	// t toggles the focused thing's Q/A: an open board editor's recording
	// layer, otherwise the containing block. Never while typing.
	const handleQAShortcut = e => {
		if ((e.key !== "t" && e.key !== "T") || e.ctrlKey || e.metaKey || e.altKey) return;
		if (e.target.closest?.("input, textarea, [contenteditable='true']")) return;
		const boardEl = e.target.closest?.("[data-board-id]");
		if (boardEl && isEditing(boardEl.dataset.boardId)) {
			boardEditors[boardEl.dataset.boardId]?.toggleAnswer();
			e.preventDefault();
			return;
		}
		const blockEl = e.target.closest?.("[data-block-id]");
		const block = blockEl && blocks.find(b => b.id === blockEl.dataset.blockId);
		if (block) {
			block.answer = !block.answer;
			e.preventDefault();
		}
	}

	const deleteBlock = blockIndex => {
		const block = blocks[blockIndex];
		if (block.type === "chessboards") {
			for (const board of block.content) closeEditor(board.id);
		}
		blocks.splice(blockIndex, 1);
	}

	const duplicateChessboard = (blockIndex, boardIndex) => {
		// deep copy (with its own id) so the duplicate's moves/annotations are independent
		blocks[blockIndex].content.splice(boardIndex + 1, 0, {
			...$state.snapshot(blocks[blockIndex].content[boardIndex]),
			id: crypto.randomUUID(),
			// don't inherit half-typed FEN input
			fenInput: undefined
		});
	}

	const deleteChessboard = (blockIndex, boardIndex) => {
		if (blocks[blockIndex].content.length === 1) {
			deleteBlock(blockIndex);
		} else {
			closeEditor(blocks[blockIndex].content[boardIndex].id);
			blocks[blockIndex].content.splice(boardIndex, 1);
		}
	}

	// --- drag and drop (svelte-dnd-action) ---
	// Blocks reorder within the card's block zone; boards move within/between
	// existing chessboard blocks only (new blocks come from the + Chessboard
	// block button, never from dragging).
	//
	// Whole items are draggable. Presses on interactive parts (text editing,
	// inputs, buttons, piece moving in open board editors) are stopped before
	// they reach the library's drag listener: it registers on the item element
	// after these template listeners, so stopImmediatePropagation blocks it.
	// (Toggling dragDisabled from the press itself can't work here: with
	// dragDisabled the library attaches no listener, and in Svelte 5 the
	// action update flushes only after the press event is over.)

	// Note: an open editor's chessboard guards itself — ChessboardEditor stops
	// board presses from bubbling to the drag listeners (piece dragging).
	const pressIsInteractive = target =>
		!!target.closest("input, textarea, select, button, a[href], [contenteditable]");

	const guardBlockPress = e => {
		if (pressIsInteractive(e.target)) e.stopImmediatePropagation();
	}

	const guardBoardPress = e => {
		if (pressIsInteractive(e.target)) e.stopImmediatePropagation();
		// a board press must not also start a drag of the surrounding block
		else e.stopPropagation();
	}

	// dndzone hands back a fresh array; splice keeps the same $state proxy
	const setItems = (array, items) => array.splice(0, array.length, ...items);

	// A drag's shadow item renders as an empty box of the dragged element's
	// height (isShadow + cardDnd.dragHeight) instead of its real content: the
	// content (chessboards, tiptap) sizes itself after mounting, so rendering it
	// made the freshly-mounted placeholder briefly the wrong height — a visible
	// jump of everything below at drag start. Measured before the first
	// re-render, while the pressed element is still in the zone's DOM.
	const isShadow = item => !!item[SHADOW_ITEM_MARKER_PROPERTY_NAME];

	const measureDragHeight = e => {
		const index = e.detail.items.findIndex(isShadow);
		cardDnd.dragHeight = e.target.children[index]?.getBoundingClientRect().height ?? 0;
	}

	// dragging the last board out of a block into another destroys the emptied
	// block. Runs when a drop settles — finalize fires on both the source and
	// target zones.
	const cleanupEmptyBlocks = () => {
		for (let i = blocks.length - 1; i >= 0; i--) {
			if (blocks[i].type === "chessboards" && blocks[i].content.length === 0) {
				blocks.splice(i, 1);
			}
		}
	}

	// the dragged ghost has pointer-events: none, so the grabbing cursor must
	// come from a page-wide override, not the ghost itself
	const setGrabbing = on => document.body.classList.toggle("dnd-grabbing", on);

	// keep flips enabled just past the drop so its settle reshuffle animates
	const settleFlip = () => setTimeout(() => cardDnd.dndAnimating = false, 450);

	const suppressGrowAroundDragStart = () => {
		cardDnd.suppressGrow = true;
		setTimeout(() => cardDnd.suppressGrow = false, 100);
	}

	// Space for the shadow placeholder opens gradually when the drag enters a
	// zone; read imperatively on mount so a later flag change can't retrigger
	// it. Duration/easing matches the zones' min-height transition, so space
	// opening in one zone and closing in another move in lockstep.
	const growIn = (node, isShadowItem) => {
		if (!isShadowItem || cardDnd.suppressGrow) return;
		node.animate(
			[{ height: "0px" }, { height: node.style.height }],
			{ duration: 400, easing: "cubic-bezier(0.25, 0.1, 0.25, 1)" }
		);
	}

	// The library locks the origin zone's min size for the whole drag
	// (preventShrinking), so it would only give up its space on drop. The
	// width lock goes right away; the height lock is released the moment the
	// dragged item is spaced into another zone (DRAGGED_LEFT) — the zones'
	// min-height transition then closes the freed space smoothly instead of
	// snapping.
	const unlockShrinking = el => el.style.minHeight = "";

	// When the drag moves into another zone the library drops its own size
	// lock in the same frame the shadow leaves. Re-lock the losing zone at its
	// current height (transitions off, committed with a forced reflow), then
	// close it by exactly the dragged item's height — same frame, duration and
	// curve as the space growing in the target zone, so the two mirror out and
	// the combined height stays constant. Animating to zero instead would let
	// the content clamp the transition and finish the visible close early.
	let releaseEpoch = 0;
	const releaseHeightSmoothly = el => {
		// a newer release on the same zone bumps the epoch, cancelling the
		// stale cleanup timeout
		const epoch = ++releaseEpoch;
		el.dataset.releaseEpoch = epoch;
		const from = el.getBoundingClientRect().height;
		const to = Math.max(from - cardDnd.dragHeight, 0);
		el.style.transitionProperty = "none";
		el.style.minHeight = from + "px";
		void el.offsetHeight;
		el.style.transitionProperty = "";
		el.style.minHeight = to + "px";
		// once settled, hand height control back to the content
		setTimeout(() => {
			if (Number(el.dataset.releaseEpoch) === epoch) el.style.minHeight = "";
		}, 450);
	}

	const handleBlocksConsider = e => {
		const { trigger } = e.detail.info;
		if (trigger === TRIGGERS.DRAG_STARTED) {
			// so any re-mount during drag rendering can't lose text
			syncTextBlocks(blocks);
			measureDragHeight(e);
			setGrabbing(true);
			cardDnd.dndAnimating = true;
			suppressGrowAroundDragStart();
			e.target.style.minWidth = "";
		}
		if (trigger === TRIGGERS.DRAGGED_LEFT) {
			// leaving the origin keeps the shadow in its items (its space stays
			// until the drag enters another zone) — just undo the library's size
			// lock. Leaving a zone the item was spaced into mid-drag (crossing
			// back without dropping) removes the shadow, so that zone's space
			// must be held and released like on the entered-another path.
			if (e.detail.items.some(isShadow)) unlockShrinking(e.target);
			else releaseHeightSmoothly(e.target);
		}
		if (trigger === TRIGGERS.DRAGGED_ENTERED_ANOTHER) releaseHeightSmoothly(e.target);
		if (trigger === TRIGGERS.DRAG_STOPPED) {
			setGrabbing(false);
			settleFlip();
		}
		setItems(blocks, e.detail.items);
	}

	const handleBlocksFinalize = e => {
		setItems(blocks, e.detail.items);
		setGrabbing(false);
		settleFlip();
	}

	const handleBoardsConsider = (block, e) => {
		const { trigger } = e.detail.info;
		if (trigger === TRIGGERS.DRAG_STARTED) {
			cardDnd.dragEditing = isEditing(e.detail.info.id);
			measureDragHeight(e);
			setGrabbing(true);
			cardDnd.dndAnimating = true;
			suppressGrowAroundDragStart();
			e.target.style.minWidth = "";
		}
		// a zone this drag would leave EMPTY keeps its space until the drop
		// (the min-height hold in the template owns it) so the board can be
		// dragged back; otherwise spaces close smoothly like block drags
		const leftEmpty = !e.detail.items.some(item => !isShadow(item));
		if (trigger === TRIGGERS.DRAGGED_LEFT) {
			// leaving the origin keeps the shadow in its items (its space stays
			// until the drag enters another zone) — just undo the library's size
			// lock. Leaving a zone the item was spaced into mid-drag (crossing
			// back without dropping) removes the shadow, so that zone's space
			// must be held and released like on the entered-another path.
			if (e.detail.items.some(isShadow)) unlockShrinking(e.target);
			else if (!leftEmpty) releaseHeightSmoothly(e.target);
		}
		if (trigger === TRIGGERS.DRAGGED_ENTERED_ANOTHER && !leftEmpty) releaseHeightSmoothly(e.target);
		if (trigger === TRIGGERS.DRAG_STOPPED) {
			setGrabbing(false);
			settleFlip();
		}
		setItems(block.content, e.detail.items);
	}

	const handleBoardsFinalize = (block, e) => {
		setItems(block.content, e.detail.items);
		setGrabbing(false);
		settleFlip();
		cleanupEmptyBlocks();
	}
</script>

<svelte:window onkeydown={handleQAShortcut} />

<div
	class="blocks-zone"
	class:card-empty={blocks.length === 0}
	use:dndzone={{
		items: blocks,
		type: "card-blocks",
		flipDurationMs: 150,
		// aim with the cursor: blocks vary hugely in height, so the dragged
		// element's center can be unreachably far from the pointer. Combined
		// with the patched midpoint rule (patches/svelte-dnd-action…) an item
		// is displaced when the cursor passes its center, SortableJS-style.
		useCursorForDetection: true,
		morphDisabled: true,
		dropTargetStyle: {}
	}}
	onconsider={handleBlocksConsider}
	onfinalize={handleBlocksFinalize}
>
	{#each blocks as block, blockIndex (block.id)}
		<!-- svelte-ignore a11y_no_static_element_interactions -- pointer-only drag guarding; dnd-action provides keyboard dragging on the items themselves -->
		<div
			class="block"
			data-block-id={block.id}
			class:shadow-placeholder={isShadow(block)}
			style:height={isShadow(block) ? cardDnd.dragHeight + "px" : undefined}
			use:growIn={isShadow(block)}
			animate:flip={{ duration: cardDnd.dndAnimating ? 400 : 0 }}
			onmousedown={guardBlockPress}
			ontouchstart={guardBlockPress}
		>
			{#if isShadow(block)}
				<!-- empty sized box; see measureDragHeight -->
			{:else}
			<button
				class="delete-entity-btn delete-entity-btn-on-line"
				onclick={() => deleteBlock(blockIndex)}
			>
				<CrossIcon />
			</button>
			<!-- the block's side badge: a vertical index tab riding the right
			     border, flush below the delete cross's corner; the hover
			     border flows around it (the tab covers the line segment
			     beneath itself) -->
			<div class="layer-segments layer-tab" role="radiogroup" aria-label="Front or back">
				<button
					role="radio"
					aria-checked={!block.answer}
					class:selected={!block.answer}
					onclick={() => block.answer = false}
				>
					Front
				</button>
				<button
					role="radio"
					aria-checked={block.answer}
					class:selected={block.answer}
					onclick={() => block.answer = true}
				>
					Back
				</button>
			</div>
			{#if block.type === "text"}
				<div class="text-block">
					<TextEditor bind:this={block.textEditor} content={block.content} />
				</div>
			{:else if block.type === "chessboards"}
				<div
					class={{
						"single-board-block": block.content.length < 2,
						"board-grid-block": block.content.length > 1
					}}
					style:min-height={block.content.length === 0 && cardDnd.dndAnimating
						? cardDnd.dragHeight + "px"
						: undefined}
					use:dndzone={{
						items: block.content,
						type: "card-boards",
						flipDurationMs: 150,
						// cursor + patched midpoint rule, see the blocks zone
						useCursorForDetection: true,
						// keep the ghost exactly as picked up: morphing animates it
						// toward the hovered zone's item size, a distracting wobble
						morphDisabled: true,
						transformDraggedElement: el => el.style.opacity = "0.85",
						dropTargetStyle: {}
					}}
					onconsider={e => handleBoardsConsider(block, e)}
					onfinalize={e => handleBoardsFinalize(block, e)}
				>
					{#each block.content as board, boardIndex (board.id)}
						<!-- svelte-ignore a11y_no_static_element_interactions -- pointer-only drag guarding; dnd-action provides keyboard dragging on the items themselves -->
						<div
							class="board-container"
							data-board-id={board.id}
							class:shadow-placeholder={isShadow(board)}
							class:board-container-editing={layoutAsEditor(board)}
							style:height={isShadow(board) ? cardDnd.dragHeight + "px" : undefined}
							use:growIn={isShadow(board)}
							animate:flip={{ duration: cardDnd.dndAnimating ? 400 : 0 }}
							onmousedown={guardBoardPress}
							ontouchstart={guardBoardPress}
							style:order={layoutAsEditor(board)
								? 2 * (boardIndex - boardIndex % 2) + 1
								: 2 * (boardIndex + 1)}
						>
							{#if isShadow(board)}
								<!-- empty sized box; see measureDragHeight -->
							{:else}
							{#if showBoardNumbers}
								<p class="board-number">
									{boardsBefore(blocks, blockIndex) + boardIndex + 1}
								</p>
							{/if}
							{#if showsEditor(board)}
								{#key board}
									<ChessboardEditor
										bind:this={boardEditors[board.id]}
										{board}
										boardOnBack={block.answer}
										restore={cardDnd.editorStates[board.id]}
										onFenValidityChange={valid => {
											if (valid) delete cardDnd.invalidBoards[board.id];
											else cardDnd.invalidBoards[board.id] = true;
										}}
										persistState={state => {
											// keep only if the editor is still open: the unmount
											// is navigation/drag re-rendering, not Ok/Cancel
											if (isEditing(board.id)) cardDnd.editorStates[board.id] = state;
										}}
										onSave={newBoardData => {
											// mutate in place: replacing the array item makes the
											// keyed each reconcile and flip-animate the shrink
											Object.assign(board, newBoardData);
											closeEditorAndRefocus(board.id);
										}}
										onCancel={() => closeEditorAndRefocus(board.id)}
									/>
								{/key}
							{:else}
								<div class="board-area">
									<button
										class="delete-entity-btn delete-entity-btn-inside"
										onclick={() => deleteChessboard(blockIndex, boardIndex)}
									>
										<CrossIcon />
									</button>
									<Chessboard
										{board}
										flushBottom
										authorView={!block.answer}
										revealed={block.answer ? true : (showBackBoards[board.id] ?? true)}
									>
										<div class="button-row">
											<input
												class:invalid-fen={board.fenInput !== undefined}
												bind:value={
													() => board.fenInput ?? board.fen,
													value => setBoardFen(board, value)
												}
												/>
											{#if !block.answer}
												<button
													class="show-back-btn"
													aria-pressed={showBackBoards[board.id] ?? true}
													onclick={() => showBackBoards[board.id] = !(showBackBoards[board.id] ?? true)}
												>
													{#if showBackBoards[board.id] ?? true}<EyeIcon />{:else}<EyeOffIcon />{/if}
													<span>Back</span>
												</button>
											{/if}
											<button
												onclick={() => duplicateChessboard(blockIndex, boardIndex)}
											>
												Duplicate
											</button>
											<button
												class="edit-btn"
												onclick={() => openEditor(board.id)}
											>
												Edit
											</button>
										</div>
									</Chessboard>
								</div>
							{/if}
							{/if}
						</div>
					{/each}
				</div>
				<button
					class="white-btn add-chessboard-btn"
					onclick={() => addChessboard(blockIndex)}
				>
					+ Chessboard
				</button>
			{/if}
			{/if}
		</div>
	{/each}
</div>
<div class="add-block-container">
	<button
		class="white-btn"
		onclick={addChessboardBlock}
	>
		+ Chessboard block
	</button>
	<button
		class="white-btn"
		onclick={addTextBlock}
	>
		+ Text
	</button>
</div>

<style>
	/* stretch the drag hit-area past the card's first/last block without
	   moving layout (padding out, negative margin back), so a drag hovering
	   just above/below the list still counts as the first/last position
	   instead of "dragged outside" */
	.blocks-zone {
		padding-top: 60px;
		margin-top: -60px;
		padding-bottom: 110px;
		margin-bottom: -110px;
	}
	.blocks-zone {
		display: flex;
		flex-direction: column;
		/* smooths releasing the drag lock's freed space, see unlockShrinking */
		transition: min-height 400ms cubic-bezier(0.25, 0.1, 0.25, 1);
	}
	/* a card with no blocks keeps invisible space so a block can always be
	   dragged there (a hovering drag's shadow item removes the class itself) */
	.blocks-zone.card-empty {
		margin-top: 12px;
		min-height: 64px;
	}
	.block {
		display: flex;
		flex-direction: column;
		border: 1px solid transparent;
		padding: 0 10px 10px 10px;
		position: relative;
	}
	.block:hover {
		border: 1px solid rgba(0, 0, 0, 0.2);
	}
	/* Front|Back segments, same language as the card-type and editor-stage
	   segments: grey track, the selected side lifted white; always visible —
	   it is the block's side badge. As a .layer-tab it is an index tab on
	   the CARD's right edge: outside the card, its left side flush on the
	   card border (21px = the card's 20px side padding + the block's own 1px
	   border, which the % base excludes), aligned with its block's top, and
	   never taller than the shortest possible block (an empty text block). */
	.layer-tab {
		position: absolute;
		left: calc(100% + 21px);
		top: 0;
		z-index: 1;
		max-height: 88px;
		border: 1px solid #dcdcdc;
		border-left: none;
		border-radius: 0 10px 10px 0;
		box-shadow: rgba(0, 0, 0, 0.08) 1px 1px 3px;
	}
	.layer-segments {
		display: flex;
		flex-direction: column;
		gap: 2px;
		background-color: #e6e6e6;
		padding: 2px;
	}
	.layer-segments button {
		writing-mode: vertical-rl;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 4px 3px;
		border: none;
		border-radius: 999px;
		background-color: transparent;
		color: rgba(0, 0, 0, 0.5);
		font-size: 0.8rem;
		cursor: pointer;
	}
	.layer-segments button:hover:not(.selected) {
		color: black;
	}
	.layer-segments button.selected {
		background-color: white;
		box-shadow: rgba(0, 0, 0, 0.18) 0 1px 2px;
		color: black;
	}
	.delete-entity-btn-on-line {
		top: -10px;
		right: -10px;
	}
	/* a chessboard block whose last board is dragged into another block stays
	   visible (empty) for the whole drag — the board can still return home —
	   and is only destroyed when the drop lands elsewhere (finalize) */
	/* draggable items advertise grab, except over their interactive parts
	   (mirrors pressIsInteractive, where a press won't start a drag) */
	.block {
		cursor: grab;
	}
	.block :global(:is(input, textarea, [contenteditable])) {
		cursor: text;
	}
	.block :global(:is(button:enabled, select, a[href])) {
		cursor: pointer;
	}
	.block :global(input:disabled) {
		cursor: default;
	}
	/* an open editor's chessboard is a control; let the board's own piece
	   cursors apply instead of grab */
	.board-container-editing :global(.cm-chessboard) {
		cursor: auto;
	}
	:global(body.dnd-grabbing),
	:global(body.dnd-grabbing *) {
		cursor: grabbing !important;
	}
	.delete-entity-btn {
		position: absolute;
		display: flex;
		justify-content: center;
		align-items: center;
		background-color: gainsboro;
		border: 1px solid black;
		height: 21px;
		width: 21px;
		cursor: pointer;
		border-radius: 4px;
		z-index: 1;
	}
	.delete-entity-btn-inside {
		top: 3px;
		right: 3px;
	}
	@media (hover: hover) {
		.delete-entity-btn {
			opacity: 0
		}
	}
	.delete-entity-btn:hover {
		background-color: darkgrey;
	}
	.block:hover > .delete-entity-btn {
		opacity: 1;
	}
	.text-block {
		display: flex;
		justify-content: start;
		position: relative;
		padding-top: 10px;
	}
	.single-board-block {
		display: flex;
		position: relative;
		flex-direction: column;
		align-items: center;
		padding-top: 10px;
		transition: min-height 400ms cubic-bezier(0.25, 0.1, 0.25, 1);
	}
	/* a lone board keeps the same size as a 2-column grid cell, centered;
	   this also gives a drag's empty shadow box its proper width, so drops
	   snap back cleanly instead of animating to a collapsed sliver */
	.single-board-block > .board-container:not(.board-container-editing) {
		width: calc(50% - 10px);
		/* a board wider than the half-width cell (Chessboard minWidth) must
		   grow the centered cell, not spill out one-sided */
		min-width: min-content;
	}
	.board-grid-block {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		grid-auto-flow: dense;
		gap: 20px;
		position: relative;
		padding-top: 10px;
		transition: min-height 400ms cubic-bezier(0.25, 0.1, 0.25, 1);
	}
	.board-container {
		position: relative;
		display: flex;
		flex-direction: column;
	}
	.board-container .button-row {
		/* overlap onto the board's bottom edge: at fractional browser zoom
		   (Chromium) the svg rasterizes to whole device pixels, which can open
		   a hairline seam between board and bar — covering it beats chasing
		   sub-pixel rounding */
		margin: -1px 0 0 0;
		position: relative;
	}
	/* bordered boards overlap deeper (the extra sits on the widened bottom
	   border, see Chessboard.svelte) so no zoom factor can expose a seam */
	.board-container:has(.board.black-border) .button-row {
		margin-top: -2px;
	}
	.board-container .button-row > * {
		border-radius: 0;
	}
	/* the FEN input must shrink below its intrinsic size, or the row's
	   minimum width exceeds the board's and overflows right (and inflates a
	   lone board's min-content cell past grid size) */
	.board-container .button-row > input {
		flex: 1 1 auto;
		min-width: 0;
	}
	.board-container .button-row > button {
		padding: 3px 16px;
	}
	/* front boards (the rows with the Front/Back preview): the FEN gets half
	   the bar and the three buttons fill the other half at their natural
	   widths; buttons never shrink below their label — the input yields
	   instead when space is truly tight */
	.board-container .button-row:has(> .show-back-btn) > input {
		flex: 0 1 45%;
		box-sizing: border-box;
	}
	.board-container .button-row:has(> .show-back-btn) > button {
		flex: 1 1 auto;
		min-width: max-content;
		box-sizing: border-box;
		padding: 3px 12px;
		white-space: nowrap;
	}
	.board-container .button-row > input:focus {
		position: relative;
		z-index: 1;
	}
	.board-container .button-row > input.invalid-fen {
		border: 1px solid #c00;
		outline-color: #c00;
	}
	/* fixed width so Show back / Hide back toggle without shifting the row */
	.button-row .show-back-btn {
		width: 76px;
		padding: 3px 0;
		display: flex;
		gap: 5px;
		align-items: center;
		justify-content: center;
		white-space: nowrap;
	}
	.board-container:hover .delete-entity-btn {
		opacity: 1;
	}
	.board-area {
		position: relative;
		display: flex;
		flex-direction: column;
	}
	.board-container-editing {
		grid-column: 1 / -1;
		width: 100%;
	}
	/* the empty box standing in for the dragged item (its measured height is
	   set inline); border-box so the block's padding doesn't add to it */
	.shadow-placeholder {
		box-sizing: border-box;
	}
	.add-chessboard-btn {
		align-self: end;
		margin-top: 24px;
	}
	.add-block-container {
		margin: 16px 0;
		display: flex;
		justify-content: center;
		gap: 16px;
	}
</style>
