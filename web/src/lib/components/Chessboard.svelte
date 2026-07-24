<script>
	import { onMount, getContext } from "svelte"
	import "cm-chessboard/assets/chessboard.css"
	import "cm-chessboard/assets/extensions/arrows/arrows.css"
	import "cm-chessboard/assets/extensions/markers/markers.css"
	import { Chessboard } from "cm-chessboard/src/Chessboard.js"
	import { Arrows } from "cm-chessboard/src/extensions/arrows/Arrows.js"
	import { Markers } from "cm-chessboard/src/extensions/markers/Markers.js"
	import { normalizeBoard } from "$lib/card-utils.js"
	import { replayMoves, showAnnotations } from "$lib/board-utils.js"
	import { playMoveSound } from "$lib/sounds.js"
	import { DEFAULT_BOARD_PREFS, boardStyleProps, hasBlackBorder, withSpriteCache } from "$lib/board-prefs.js"

	// `board` is a board object ({ fen, moves, annotations, orientation }) or a
	// legacy FEN string; `children` renders between the board and the move line
	// (e.g. the card editor's FEN/Duplicate/Edit row)
	let { board, minWidth = "409px", flushBottom = false, children } = $props();

	let normalized = $derived(normalizeBoard(board));
	let replay = $derived(replayMoves(normalized));
	let positions = $derived(replay.fens);
	let hasMoves = $derived(positions.length > 1);

	let currentIndex = $state(0);
	// a different board (e.g. next flashcard) starts back at its start position
	$effect(() => { void board; currentIndex = 0; });
	let displayIndex = $derived(Math.min(currentIndex, positions.length - 1));

	// One-line move list, grouped so the line only wraps between pairs: each
	// pair is a number ("…" appended when black starts it, e.g. black moving
	// first or repeatedly) plus its move(s); each move keeps its move index so
	// clicking selects the position after it.
	let moveLine = $derived.by(() => {
		const pairs = [];
		let pairOpen = false;
		replay.moveInfos.forEach(({ san, color }, index) => {
			if (color !== "b" || !pairOpen) {
				pairs.push({ number: pairs.length + 1, ellipsis: color === "b", moves: [] });
			}
			pairs[pairs.length - 1].moves.push({ san, index });
			pairOpen = color === "w";
		});
		return pairs;
	});

	let chessboardElement = $state();
	let cmBoard = $state();
	let renderedIndex = 0;

	$effect(() => {
		const fen = positions[displayIndex];
		const annotation = normalized.annotations[displayIndex];
		if (!cmBoard) return;
		if (cmBoard.getOrientation() !== normalized.orientation) {
			cmBoard.setOrientation(normalized.orientation, false);
		}
		// only animate actual navigation, not e.g. FEN edits of the shown position
		cmBoard.setPosition(fen, displayIndex !== renderedIndex);
		renderedIndex = displayIndex;
		showAnnotations(cmBoard, annotation);
	})

	const boardPrefs = getContext("boardPrefs") ?? (() => DEFAULT_BOARD_PREFS);

	onMount(() => {
		cmBoard = withSpriteCache(boardPrefs().pieceSet, () => new Chessboard(chessboardElement, {
			position: positions[0],
			orientation: normalized.orientation,
			assetsUrl: "/chessboard-assets/", // wherever you copied the assets folder to, could also be in the node_modules folder
			style: boardStyleProps(boardPrefs()),
			extensions: [{ class: Arrows }, { class: Markers }]
		}))
		// cm-chessboard sizes its inner box to whole pixels inside our
		// fractional-width container; --board-px lets the bar below and the
		// move line match the board's real rendered width exactly
		const boardBox = chessboardElement.firstElementChild;
		const syncWidth = () => wrapperElement.style.setProperty(
			"--board-px", boardBox.getBoundingClientRect().width + "px"
		);
		syncWidth();
		const resizeObserver = new ResizeObserver(syncWidth);
		resizeObserver.observe(boardBox);
		return () => {
			resizeObserver.disconnect();
			cmBoard.destroy();
		};
	})

	// stepping forward sounds the move being made, stepping back the move
	// being unmade (both are the move crossed between the two positions)
	const goTo = index => {
		if (index !== displayIndex) {
			const crossed = index > displayIndex ? index - 1 : displayIndex - 1;
			playMoveSound(replay.moveInfos[crossed]?.san);
		}
		currentIndex = index;
	}
	const previous = () => { if (displayIndex > 0) goTo(displayIndex - 1); }
	const next = () => { if (displayIndex < positions.length - 1) goTo(displayIndex + 1); }

	let wrapperElement = $state();

	// left board half steps back, right half steps forward; focusing the
	// wrapper makes the arrow keys work right after a click
	const handleBoardClick = e => {
		wrapperElement.focus({ preventScroll: true });
		const rect = chessboardElement.getBoundingClientRect();
		if (e.clientX - rect.left < rect.width / 2) previous(); else next();
	}

	const handleKeyDown = e => {
		if (e.key === "ArrowLeft") {
			e.preventDefault();
			previous();
		} else if (e.key === "ArrowRight") {
			e.preventDefault();
			next();
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events -->
<div
	style="min-width: {minWidth}"
	class="board-wrapper"
	bind:this={wrapperElement}
	tabindex={hasMoves ? 0 : undefined}
	role="group"
	aria-label={hasMoves ? "Chessboard, use arrow keys to step through moves" : "Chessboard"}
	onkeydown={hasMoves ? handleKeyDown : undefined}
>
	<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -- keyboard stepping lives on the focusable wrapper -->
	<div
		class="board"
		class:black-border={hasBlackBorder(boardPrefs())}
		class:flush-bottom={flushBottom}
		bind:this={chessboardElement}
		onclick={hasMoves ? handleBoardClick : undefined}
	></div>
	{@render children?.()}
	{#if hasMoves}
		<div class="move-line">
			<button
				class="step-btn"
				aria-label="Previous move"
				disabled={displayIndex === 0}
				onclick={previous}
			>‹</button>
			<button
				class="step-btn"
				aria-label="Next move"
				disabled={displayIndex === positions.length - 1}
				onclick={next}
			>›</button>
			{#each moveLine as pair}
				<span class="move-pair">
					<span class="move-number">{pair.number}</span>
					{#each pair.moves as move, moveIndex}
						<button
							class="move-btn"
							class:current={displayIndex === move.index + 1}
							onclick={() => goTo(move.index + 1)}
						>
							{pair.ellipsis && moveIndex === 0 ? "…" + move.san : move.san}
						</button>
					{/each}
				</span>
			{/each}
		</div>
	{/if}
</div>

<style>
	/* The border lives on cm-chessboard's whole-pixel inner box (not on this
	   fractional-width container), so the frame hugs the board exactly and
	   --board-px (measured on that box, border included) gives the bar and
	   move line the same outer width. The dark background makes any svg
	   rasterization slack at fractional zoom read as border, not white. */
	.board.black-border > :global(div) {
		border: 2px solid #404040;
		background-color: #404040;
		border-radius: 2px;
	}
	.board.flush-bottom > :global(div) {
		border-radius: 2px 2px 0 0;
	}
	/* a flush bar below overlaps 2px (CardSideEditor); widen the bottom
	   border so 2px stay visible, matching the other sides */
	.board.black-border.flush-bottom > :global(div) {
		border-bottom-width: 4px;
	}
	.board-wrapper {
		display: flex;
		flex-direction: column;
	}
	/* center the whole-pixel board box, and give everything below it (the
	   slotted FEN/Duplicate/Edit bar, the move line) that exact width so
	   edges align instead of the bar overhanging the board */
	.board > :global(div) {
		margin: 0 auto;
	}
	.board-wrapper > :global(.button-row),
	.board-wrapper > .move-line {
		width: var(--board-px, 100%);
		box-sizing: border-box;
		margin-left: auto;
		margin-right: auto;
	}
	.board-wrapper:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	/* quiet step controls heading the move line; the ends fade out rather
	   than disappear, so the line never shifts */
	.step-btn {
		border: none;
		background-color: transparent;
		border-radius: 3px;
		padding: 0 8px 2px 8px;
		font-size: 1.3rem;
		line-height: 1;
		color: rgba(0, 0, 0, 0.55);
		cursor: pointer;
		user-select: none;
	}
	.step-btn:last-of-type {
		margin-right: 4px;
	}
	.step-btn:hover:enabled {
		background-color: gainsboro;
		color: black;
	}
	.step-btn:disabled {
		color: rgba(0, 0, 0, 0.2);
		cursor: default;
	}
	.move-line {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		column-gap: 6px;
		padding: 4px 2px;
	}
	/* a pair (number + its moves) never breaks across lines */
	.move-pair {
		display: inline-flex;
		align-items: baseline;
		column-gap: 2px;
		white-space: nowrap;
	}
	.move-number {
		font-size: 0.85rem;
		color: rgba(0, 0, 0, 0.6);
	}
	.move-btn {
		border: none;
		background-color: transparent;
		border-radius: 3px;
		padding: 1px 4px;
		cursor: pointer;
	}
	.move-btn:hover {
		background-color: gainsboro;
	}
	.move-btn.current {
		background-color: var(--accent);
		color: white;
	}
</style>
