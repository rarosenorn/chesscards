<script>
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

	// dnd: shared state object (createCardDnd) the page passes to both side
	// editors, so blocks/boards drag between front and back.
	// isBack: back-side boards are only visible once the card is turned, so
	// their editors hide the back-layer toggle (nothing left to hide).
	let { side, boardNumberOffset = 0, showBoardNumbers = false, dnd: cardDnd, extendEdge = null, isBack = false } = $props();

	// board id -> mounted ChessboardEditor instance, for applyOpenEditors
	const boardEditors = {};

	// board id -> whether its collapsed view shows the turned card (back
	// moves/annotations included); defaults on, toggle off for the
	// student's pre-turn view
	const showBackBoards = $state({});

	// Applies every open board editor on this side, as if Ok was pressed —
	// without closing them, so a submit causes no editor->board flash; the
	// editors disappear with the rest of the card when the caller resets it.
	// A pending invalid FEN survives as the board's fenInput for the card
	// validators to catch.
	export const applyOpenEditors = () => {
		for (const block of side) {
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
		side.push({ id: crypto.randomUUID(), type: "text", textEditor: null });
		// through the $state proxy, not the pushed literal: bind:this lands on
		// the proxied block
		const block = side[side.length - 1];
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
		side.push({ id: crypto.randomUUID(), type: "chessboards", content: [board] });
		openEditor(board.id);
		focusNewBoardEditor(board.id);
	}

	const addChessboard = blockIndex => {
		const board = newBoard(startFen);
		side[blockIndex].content.push(board);
		openEditor(board.id);
		focusNewBoardEditor(board.id);
	}

	// t toggles an open board editor's front/back recording layer when focus
	// is inside it (never while typing)
	const handleLayerShortcut = e => {
		if ((e.key !== "t" && e.key !== "T") || e.ctrlKey || e.metaKey || e.altKey) return;
		if (e.target.closest?.("input, textarea, [contenteditable='true']")) return;
		const boardEl = e.target.closest?.("[data-board-id]");
		if (boardEl && isEditing(boardEl.dataset.boardId)) {
			boardEditors[boardEl.dataset.boardId]?.toggleAnswer();
			e.preventDefault();
		}
	}

	const deleteBlock = blockIndex => {
		const block = side[blockIndex];
		if (block.type === "chessboards") {
			for (const board of block.content) closeEditor(board.id);
		}
		side.splice(blockIndex, 1);
	}

	const duplicateChessboard = (blockIndex, boardIndex) => {
		// deep copy (with its own id) so the duplicate's moves/annotations are independent
		side[blockIndex].content.splice(boardIndex + 1, 0, {
			...$state.snapshot(side[blockIndex].content[boardIndex]),
			id: crypto.randomUUID(),
			// don't inherit half-typed FEN input
			fenInput: undefined
		});
	}

	const deleteChessboard = (blockIndex, boardIndex) => {
		if (side[blockIndex].content.length === 1) {
			deleteBlock(blockIndex);
		} else {
			closeEditor(side[blockIndex].content[boardIndex].id);
			side[blockIndex].content.splice(boardIndex, 1);
		}
	}

	// --- drag and drop (svelte-dnd-action) ---
	// Blocks reorder within/between the two sides' block zones; boards move
	// within/between existing chessboard blocks only (new blocks come from the
	// + Chessboard block button, never from dragging).
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
		for (let i = side.length - 1; i >= 0; i--) {
			if (side[i].type === "chessboards" && side[i].content.length === 0) {
				side.splice(i, 1);
			}
		}
	}

	// the dragged ghost has pointer-events: none, so the grabbing cursor must
	// come from a page-wide override, not the ghost itself
	const setGrabbing = on => document.body.classList.toggle("dnd-grabbing", on);

	const endDrag = () => {
		setGrabbing(false);
		cardDnd.dragging = false;
	}

	// --- drag animation ---
	// One duration and curve for everything that moves during a drag: items
	// flipping aside, space opening where the drag enters, space closing where
	// it left. Space and FLIP never run at once (holdFlipOff); an opening and a
	// closing always do, and only cancel out if they share these. The bezier is
	// flip's own default curve (cubicOut) written for CSS, and the zones'
	// min-height transition must stay on the same pair.
	const DND_MS = 180;
	const DND_EASING = "cubic-bezier(0.215, 0.61, 0.355, 1)";

	// A consider event tells us space is about to move before the DOM knows it,
	// which is what FLIP needs: it is created during the same update and would
	// otherwise animate items toward positions the opening space has not
	// reached yet. The extra frame covers the close, which can only be measured
	// after the update and so starts one behind the open.
	const holdFlipOff = () => {
		cardDnd.spaceAnimating++;
		setTimeout(() => cardDnd.spaceAnimating--, DND_MS + 32);
	}

	const flipMs = $derived(cardDnd.dragging && !cardDnd.spaceAnimating ? DND_MS : 0);

	// the placeholder for the picked-up item mounts in the flush this event
	// triggers; the next frame is after it and before any zone the drag goes on
	// to enter, so every later placeholder still opens animated
	const suppressGrowForThisFlush = () => {
		cardDnd.suppressGrow = true;
		requestAnimationFrame(() => cardDnd.suppressGrow = false);
	}

	// space for a placeholder mounting mid-drag opens over DND_MS instead of
	// appearing at full height, so what the drag pushes down flows rather than
	// jumps. Read imperatively on mount: a later flag change can't retrigger it
	const growIn = (node, isShadowItem) => {
		if (!isShadowItem || cardDnd.suppressGrow) return;
		node.animate(
			[{ height: "0px" }, { height: node.style.height }],
			{ duration: DND_MS, easing: DND_EASING }
		);
	}

	// The library locks the origin zone's min size for the whole drag
	// (preventShrinking), so it would only give up its space on drop. Where the
	// shadow stays in the zone's items its space is held by the placeholder
	// instead, and the lock can just go.
	const unlockShrinking = el => el.style.minHeight = "";

	// Closes the space a zone the drag has left is still holding, over the same
	// window as the space opening wherever it went — the card's total height
	// then never moves. The zone closes to what it measures once the item is
	// out of its DOM, not to "its height minus the dragged one": where losing
	// an item costs a zone less than that (two boards share a grid row, so
	// losing one costs it no height at all) the difference sprang back on the
	// drop. Transitions off while re-locking, so the measurement is never
	// painted.
	let releaseEpoch = 0;
	const releaseHeightSmoothly = async el => {
		const from = el.getBoundingClientRect().height;
		await tick();
		const epoch = ++releaseEpoch;
		el.dataset.releaseEpoch = epoch;
		el.style.transitionProperty = "none";
		el.style.minHeight = "";
		const to = el.getBoundingClientRect().height;
		el.style.minHeight = from + "px";
		void el.offsetHeight;
		el.style.transitionProperty = "";
		el.style.minHeight = to + "px";
		// once settled, hand height control back to the content
		setTimeout(() => {
			if (Number(el.dataset.releaseEpoch) === epoch) el.style.minHeight = "";
		}, DND_MS);
	}

	// the shadow arriving in a zone opens space there, and leaving one closes
	// the space it held — except where it leaves the origin, which keeps the
	// shadow in its items so the item's own space stays open for its return;
	// re-entering there is then a plain reorder, and flips like one
	const opensSpace = (trigger, current) =>
		trigger === TRIGGERS.DRAGGED_ENTERED && !current.some(isShadow);
	const closesSpace = (trigger, items) =>
		trigger === TRIGGERS.DRAGGED_ENTERED_ANOTHER
		|| (trigger === TRIGGERS.DRAGGED_LEFT && !items.some(isShadow));

	const handleBlocksConsider = e => {
		const { trigger } = e.detail.info;
		if (trigger === TRIGGERS.DRAG_STARTED) {
			// so any re-mount during drag rendering can't lose text
			syncTextBlocks(side);
			measureDragHeight(e);
			suppressGrowForThisFlush();
			setGrabbing(true);
			cardDnd.dragging = true;
			e.target.style.minWidth = "";
		}
		const closing = closesSpace(trigger, e.detail.items);
		if (closing || opensSpace(trigger, side)) holdFlipOff();
		// the shadow staying behind holds the origin's space by itself, so the
		// library's lock is simply dropped there
		if (trigger === TRIGGERS.DRAGGED_LEFT && !closing) unlockShrinking(e.target);
		if (trigger === TRIGGERS.DRAG_STOPPED) endDrag();
		setItems(side, e.detail.items);
		if (closing) releaseHeightSmoothly(e.target);
	}

	const handleBlocksFinalize = e => {
		setItems(side, e.detail.items);
		endDrag();
	}

	const handleBoardsConsider = (block, e) => {
		const { trigger } = e.detail.info;
		if (trigger === TRIGGERS.DRAG_STARTED) {
			cardDnd.dragEditing = isEditing(e.detail.info.id);
			measureDragHeight(e);
			suppressGrowForThisFlush();
			setGrabbing(true);
			cardDnd.dragging = true;
			e.target.style.minWidth = "";
		}
		// a zone this drag leaves EMPTY keeps its space until the drop so the
		// board can be dragged back — its hold is the template's min-height
		// and the library's own lock, neither of which may be released here
		const leftEmpty = !e.detail.items.some(item => !isShadow(item));
		const closing = !leftEmpty && closesSpace(trigger, e.detail.items);
		if (closing || opensSpace(trigger, block.content)) holdFlipOff();
		if (trigger === TRIGGERS.DRAGGED_LEFT && !leftEmpty && !closing) unlockShrinking(e.target);
		if (trigger === TRIGGERS.DRAG_STOPPED) endDrag();
		setItems(block.content, e.detail.items);
		if (closing) releaseHeightSmoothly(e.target);
	}

	const handleBoardsFinalize = (block, e) => {
		setItems(block.content, e.detail.items);
		endDrag();
		cleanupEmptyBlocks();
	}
</script>

<svelte:window onkeydown={handleLayerShortcut} />

<div
	class="blocks-zone"
	class:side-empty={side.length === 0}
	class:extend-top={extendEdge === "top"}
	class:extend-bottom={extendEdge === "bottom"}
	use:dndzone={{
		items: side,
		type: "card-side-blocks",
		flipDurationMs: 0,
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
	{#each side as block, blockIndex (block.id)}
		<!-- svelte-ignore a11y_no_static_element_interactions -- pointer-only drag guarding; dnd-action provides keyboard dragging on the items themselves -->
		<div
			class="block"
			class:shadow-placeholder={isShadow(block)}
			style:height={isShadow(block) ? cardDnd.dragHeight + "px" : undefined}
			use:growIn={isShadow(block)}
			animate:flip={{ duration: flipMs }}
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
					style:min-height={block.content.length === 0 && cardDnd.dragging
						? cardDnd.dragHeight + "px"
						: undefined}
					use:dndzone={{
						items: block.content,
						type: "card-side-boards",
						flipDurationMs: 0,
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
							animate:flip={{ duration: flipMs }}
							onmousedown={guardBoardPress}
							ontouchstart={guardBoardPress}
							style:order={layoutAsEditor(board)
								? 2 * (boardIndex - boardIndex % 2) + 1
								: 2 * (boardIndex + 1)}
						>
							{#if isShadow(board)}
								<!-- empty sized box; see measureDragHeight -->
							{:else}
							{#if showsEditor(board)}
								{#key board}
									<ChessboardEditor
										bind:this={boardEditors[board.id]}
										{board}
										boardOnBack={isBack}
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
										authorView={!isBack}
										revealed={isBack ? true : (showBackBoards[board.id] ?? true)}
										number={showBoardNumbers ? boardNumberOffset + boardsBefore(side, blockIndex) + boardIndex + 1 : null}
									>
										<div class="button-row">
											<input
												class:invalid-fen={board.fenInput !== undefined}
												bind:value={
													() => board.fenInput ?? board.fen,
													value => setBoardFen(board, value)
												}
												/>
											{#if !isBack}
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
	/* the extend-* variants stretch the drag hit-area to the card's edge
	   without moving layout (padding out, negative margin back), so a drag
	   hovering above the front side / below the back side still counts as
	   that side's first/last position instead of "dragged outside".
	   The two sides also reach toward each other: the add buttons and the
	   Back label between them belonged to no zone, so a drag crossing from
	   one side to the other spent ~110px outside every zone — the space it
	   had opened collapsed and reopened, which is what made cross-side drags
	   jump. Their hit-areas now meet in that band (deep enough to overlap a
	   little: the library takes the first zone containing the cursor, which
	   is stable — the front always wins there, never a flap between them) */
	.blocks-zone.extend-top {
		padding: 60px 0 56px 0;
		margin: -60px 0 -56px 0;
		--extend-top: 60px;
		--extend-bottom: 56px;
	}
	.blocks-zone.extend-bottom {
		padding: 56px 0 110px 0;
		margin: -56px 0 -110px 0;
		--extend-top: 56px;
		--extend-bottom: 110px;
	}
	.blocks-zone {
		display: flex;
		flex-direction: column;
		--extend-top: 0px;
		--extend-bottom: 0px;
		/* the space a drag frees closes over this, see releaseHeightSmoothly */
		transition: min-height 180ms cubic-bezier(0.215, 0.61, 0.355, 1);
	}
	/* a side with no blocks keeps invisible space so a block can always be
	   dragged there (a hovering drag's shadow item removes the class itself).
	   Gap and space both live in min-height — the one property that animates,
	   so a drag emptying the side transitions onto the reserve — and both
	   carry the extend padding, which sits inside the border-box height and
	   is pulled back out by the negative margin: without adding it back the
	   space an empty side shows is whatever the padding leaves over (4px for
	   the front, none at all for the taller bottom extend) */
	.blocks-zone.side-empty {
		min-height: calc(76px + var(--extend-top) + var(--extend-bottom));
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
	.delete-entity-btn-on-line {
		top: -10px;
		right: -10px;
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
		transition: min-height 180ms cubic-bezier(0.215, 0.61, 0.355, 1);
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
		transition: min-height 180ms cubic-bezier(0.215, 0.61, 0.355, 1);
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
