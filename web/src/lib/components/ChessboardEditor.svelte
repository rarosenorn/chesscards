<script>
	import { onMount } from "svelte"
	import "cm-chessboard/assets/chessboard.css"
	import "cm-chessboard/assets/extensions/arrows/arrows.css"
	import "cm-chessboard/assets/extensions/markers/markers.css"
	import { Chessboard, INPUT_EVENT_TYPE } from "cm-chessboard/src/Chessboard.js"
	import { MOVE_CANCELED_REASON } from "cm-chessboard/src/view/VisualMoveInput.js"
	import { Arrows } from "cm-chessboard/src/extensions/arrows/Arrows.js"
	import { Markers } from "cm-chessboard/src/extensions/markers/Markers.js"
	import { RightClickAnnotator } from "cm-chessboard/src/extensions/right-click-annotator/RightClickAnnotator.js"
	import { Chess } from "chess.js"
	import { isValidFen } from "$lib/isValidFen.js"
	import { getPositionFens, isFenPlayable, serializeAnnotations, hasAnnotations, showAnnotations } from "$lib/board-utils.js"

	let { board: boardData, onSave, onCancel } = $props();

	const emptyPlacement = "8/8/8/8/8/8/8/8"
	const startPlacement = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"

	const initial = $state.snapshot(boardData);

	// start-position FEN, bound to the FEN input (setup mode only)
	let currentFen = $state(initial.fen.trim());
	let moves = $state([...initial.moves]);
	let annotations = $state({ ...initial.annotations });

	let fenIsValid = $derived(isValidFen(currentFen));
	// recording moves requires a position chess.js accepts (both kings, etc.)
	let canRecordMoves = $derived(isFenPlayable(currentFen));

	let mode = $state(initial.moves.length > 0 ? "moves" : "setup");
	// position shown in moves mode; editing continues from the last move
	let currentIndex = $state(initial.moves.length);
	let positions = $derived(getPositionFens({ fen: currentFen, moves }));

	// last start FEN accepted by the clear-moves confirm, to revert declined edits
	let acceptedFen = currentFen;

	// Recorded moves are cleared when the start position changes. Asks the user
	// first; returns false (and leaves everything untouched) if they decline.
	const confirmClearMoves = () => {
		if (moves.length === 0) return true;
		if (!confirm("Editing the start position clears the recorded moves and their annotations. Continue?")) {
			return false;
		}
		moves = [];
		// annotations on later positions are meaningless without the moves
		annotations = annotations[0] ? { 0: annotations[0] } : {};
		currentIndex = 0;
		return true;
	}

	const syncFenFromBoard = () => {
		const rest = currentFen.trim().split(/\s+/).slice(1).join(" ") || "w KQkq - 0 1";
		currentFen = board.getPosition() + " " + rest;
		acceptedFen = currentFen;
	}

	const handleFenInput = () => {
		if (!confirmClearMoves()) {
			currentFen = acceptedFen;
			return;
		}
		acceptedFen = currentFen;
		if (isValidFen(currentFen)) {
			board.setPosition(currentFen.trim().split(/\s+/)[0], true);
		}
	}

	const setPlacement = placement => {
		if (!confirmClearMoves()) return;
		board.setPosition(placement, true);
		syncFenFromBoard();
	}

	const paletteRows = [
		["wk", "wq", "wr", "wb", "wn", "wp"],
		["bk", "bq", "br", "bb", "bn", "bp"]
	]

	let boardElement;
	let board = $state();
	// piece name like "wq", "trash", or null (null = drag pieces on the board)
	let selectedTool = $state(null);

	// set by validateMoveInput, committed by moveInputFinished
	let pendingMove = null;
	let pendingFen = null;

	const handleMoveInput = event => {
		if (mode === "setup") {
			switch (event.type) {
				case INPUT_EVENT_TYPE.moveInputStarted:
					return confirmClearMoves();
				case INPUT_EVENT_TYPE.validateMoveInput:
					return true;
				case INPUT_EVENT_TYPE.moveInputCanceled:
					// dropping a piece outside the board removes it
					if (event.reason === MOVE_CANCELED_REASON.movedOutOfBoard && event.squareFrom) {
						board.setPiece(event.squareFrom, null);
					}
					syncFenFromBoard();
					break;
				case INPUT_EVENT_TYPE.moveInputFinished:
					syncFenFromBoard();
			}
			return;
		}
		// moves mode: only legal moves from the shown position, auto-queen promotion
		switch (event.type) {
			case INPUT_EVENT_TYPE.moveInputStarted:
				return true;
			case INPUT_EVENT_TYPE.validateMoveInput: {
				try {
					const chess = new Chess(positions[currentIndex]);
					pendingMove = chess.move({ from: event.squareFrom, to: event.squareTo, promotion: "q" });
					pendingFen = chess.fen();
					return true;
				} catch {
					return false;
				}
			}
			case INPUT_EVENT_TYPE.moveInputFinished:
				if (event.legalMove && pendingMove) {
					// playing a move mid-list replaces everything after this position
					moves = [...moves.slice(0, currentIndex), pendingMove.san];
					for (const key of Object.keys(annotations)) {
						if (Number(key) > currentIndex) delete annotations[key];
					}
					currentIndex += 1;
					// render from chess.js so promotion/castling/en passant show correctly
					board.setPosition(pendingFen, false);
				}
				pendingMove = null;
				pendingFen = null;
		}
	}

	const handleSquareClick = ({ square }) => {
		if (!square || !selectedTool || mode !== "setup") return;
		if (!confirmClearMoves()) return;
		board.setPiece(square, selectedTool === "trash" ? null : selectedTool);
		syncFenFromBoard();
	}

	const selectTool = tool => {
		selectedTool = selectedTool === tool ? null : tool;
		// dragging conflicts with click-to-place, so only one is active at a time
		if (selectedTool && board.isMoveInputEnabled()) {
			board.disableMoveInput();
		} else if (!selectedTool && !board.isMoveInputEnabled()) {
			board.enableMoveInput(handleMoveInput);
		}
	}

	const switchMode = newMode => {
		if (newMode === mode) return;
		if (newMode === "moves" && !canRecordMoves) return;
		if (selectedTool) selectTool(selectedTool);
		mode = newMode;
		if (mode === "moves") {
			currentIndex = Math.min(currentIndex, moves.length);
		} else {
			board.setPosition(currentFen.trim().split(/\s+/)[0], true);
		}
	}

	// index of the position annotations are attached to right now
	let annotationIndex = $derived(mode === "setup" ? 0 : Math.min(currentIndex, moves.length));

	// the annotator draws on right-click; capture its state after the event settles.
	// getArrows/getMarkers instead of getAnnotations: cm-chessboard 8.12.12 binds
	// getAnnotations to the wrong object, making it throw
	const captureAnnotations = () => setTimeout(() => {
		if (!board?.getArrows || !board?.getMarkers) return;
		const annotation = serializeAnnotations({
			arrows: board.getArrows(),
			markers: board.getMarkers()
		});
		if (hasAnnotations(annotation)) {
			annotations[annotationIndex] = annotation;
		} else {
			delete annotations[annotationIndex];
		}
	})

	// keep the board and drawn annotations in sync with the viewed position
	$effect(() => {
		if (!board) return;
		if (mode === "moves") {
			board.setPosition(positions[Math.min(currentIndex, moves.length)], true);
		}
		showAnnotations(board, annotations[annotationIndex]);
	})

	onMount(() => {
		board = new Chessboard(boardElement, {
			position: initial.fen,
			assetsUrl: "/chessboard-assets/",
			extensions: [{ class: Arrows }, { class: Markers }, { class: RightClickAnnotator }]
		})
		board.enableMoveInput(handleMoveInput);
		board.enableSquareSelect("pointerdown", handleSquareClick);
		boardElement.addEventListener("mouseup", captureAnnotations);
		return () => {
			boardElement.removeEventListener("mouseup", captureAnnotations);
			board.destroy();
		}
	})

	const save = () => onSave({
		fen: currentFen,
		moves: $state.snapshot(moves),
		annotations: $state.snapshot(annotations)
	})

	const handleKeyDown = e => {
		if (e.key === "Escape") {
			onCancel();
			return;
		}
		if (mode !== "moves" || e.target.tagName === "INPUT") return;
		if (e.key === "ArrowLeft") {
			e.preventDefault();
			currentIndex = Math.max(currentIndex - 1, 0);
		} else if (e.key === "ArrowRight") {
			e.preventDefault();
			currentIndex = Math.min(currentIndex + 1, moves.length);
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="editor">
	<div class="board-column">
		<div class="board" bind:this={boardElement}></div>
		<input
			class="fen-input"
			class:invalid={!fenIsValid}
			bind:value={currentFen}
			oninput={handleFenInput}
			disabled={mode === "moves"}
			title={mode === "moves" ? "Switch to Set up position to edit the start FEN" : ""}
		/>
	</div>
	<div class="side-panel">
		<div class="mode-tabs">
			<button
				class="mode-tab"
				class:active={mode === "setup"}
				onclick={() => switchMode("setup")}
			>
				Set up position
			</button>
			<button
				class="mode-tab"
				class:active={mode === "moves"}
				onclick={() => switchMode("moves")}
				disabled={!canRecordMoves}
				title={canRecordMoves ? "" : "The start position must be a legal position to record moves"}
			>
				Moves
			</button>
		</div>
		{#if mode === "setup"}
			<div class="palette">
				{#each paletteRows as row}
					<div class="palette-row">
						{#each row as piece}
							<button
								class="palette-piece"
								class:selected={selectedTool === piece}
								title="Click a square to place"
								onclick={() => selectTool(piece)}
							>
								<svg viewBox="0 0 40 40">
									<use href="/chessboard-assets/pieces/standard.svg#{piece}" />
								</svg>
							</button>
						{/each}
					</div>
				{/each}
				<button
					class="palette-piece trash"
					class:selected={selectedTool === "trash"}
					title="Click a square to remove its piece"
					onclick={() => selectTool("trash")}
				>
					🗑
				</button>
			</div>
			<p class="hint">
				{#if selectedTool === "trash"}
					Click a square to remove its piece
				{:else if selectedTool}
					Click a square to place the piece
				{:else}
					Drag pieces to move them, drag off the board to remove them.
					Right-click (+shift/alt) draws arrows and circles.
				{/if}
			</p>
			<div class="position-buttons">
				<button class="std-btn" onclick={() => setPlacement(startPlacement)}>Start position</button>
				<button class="std-btn" onclick={() => setPlacement(emptyPlacement)}>Clear board</button>
			</div>
		{:else}
			<div class="move-list">
				<button
					class="move-btn"
					class:current={Math.min(currentIndex, moves.length) === 0}
					onclick={() => currentIndex = 0}
				>
					Start
				</button>
				{#each moves as san, moveIndex}
					{#if moveIndex % 2 === 0}
						<span class="move-number">{moveIndex / 2 + 1}.</span>
					{/if}
					<button
						class="move-btn"
						class:current={Math.min(currentIndex, moves.length) === moveIndex + 1}
						onclick={() => currentIndex = moveIndex + 1}
					>
						{san}
					</button>
				{/each}
			</div>
			<p class="hint">
				{#if moves.length === 0}
					Play legal moves on the board to record them.
				{:else}
					← → or click a move to navigate. A new move replaces everything after the shown position.
				{/if}
				Right-click (+shift/alt) draws arrows and circles on the shown position.
			</p>
		{/if}
		<div class="actions">
			<button class="std-btn" onclick={onCancel}>Cancel</button>
			<button class="std-btn" disabled={!fenIsValid} onclick={save}>Ok</button>
		</div>
	</div>
</div>

<style>
	.editor {
		display: flex;
		gap: 20px;
		width: 100%;
	}
	.board-column {
		flex: 1 1 0;
		min-width: 0;
		align-self: start;
		display: flex;
		flex-direction: column;
	}
	.board {
		border: 2px solid #404040;
		border-radius: 2px 2px 0 0;
	}
	.fen-input {
		border: 1px solid lightgrey;
		border-bottom: 1px solid darkgrey;
		background-color: #f5f5f5;
		border-radius: 0 0 4px 4px;
		padding: 3px 6px;
	}
	.fen-input:disabled {
		color: rgba(0, 0, 0, 0.4);
	}
	.fen-input.invalid {
		border: 1px solid #c00;
		outline-color: #c00;
	}
	.side-panel {
		flex: 0 0 300px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.mode-tabs {
		display: flex;
		border: 1px solid #404040;
		border-radius: 5px;
		overflow: hidden;
	}
	.mode-tab {
		flex: 1 1 0;
		border: none;
		background-color: white;
		padding: 5px 0;
		cursor: pointer;
	}
	.mode-tab:hover:enabled {
		background-color: gainsboro;
	}
	.mode-tab.active {
		background-color: #404040;
		color: white;
	}
	.mode-tab:disabled {
		color: rgba(0, 0, 0, 0.35);
		cursor: default;
	}
	.palette {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.palette-row {
		display: flex;
		gap: 4px;
	}
	.palette-piece {
		width: 44px;
		height: 44px;
		display: flex;
		justify-content: center;
		align-items: center;
		background-color: white;
		border: 1px solid rgba(0, 0, 0, 0.2);
		border-radius: 4px;
		cursor: pointer;
		font-size: 1.3rem;
		padding: 2px;
	}
	.palette-piece:hover {
		background-color: gainsboro;
	}
	.palette-piece.selected {
		border: 2px solid #404040;
		background-color: gainsboro;
	}
	.palette-piece svg {
		width: 100%;
		height: 100%;
	}
	.move-list {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 3px;
		max-height: 200px;
		overflow-y: auto;
	}
	.move-number {
		font-size: 0.85rem;
		color: rgba(0, 0, 0, 0.6);
		margin-left: 3px;
	}
	.move-btn {
		border: 1px solid rgba(0, 0, 0, 0.2);
		border-radius: 4px;
		background-color: white;
		padding: 2px 7px;
		cursor: pointer;
	}
	.move-btn:hover {
		background-color: gainsboro;
	}
	.move-btn.current {
		background-color: #404040;
		color: white;
	}
	.hint {
		margin: 0;
		font-size: 0.85rem;
		color: rgba(0, 0, 0, 0.6);
	}
	.position-buttons {
		display: flex;
		gap: 8px;
	}
	.actions {
		display: flex;
		gap: 8px;
		margin-top: auto;
		justify-content: end;
	}
</style>
