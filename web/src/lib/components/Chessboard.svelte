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

	// `board` is a board object ({ fen, moves, annotations, solutionFrom,
	// solutionAnnotations, orientation }) or a legacy FEN string; `children`
	// renders between the board and the move line (e.g. the card editor's
	// FEN/Duplicate/Edit row).
	// `revealed` controls the solution layer: while false, moves from
	// solutionFrom on stay hidden and only the question annotations show; when
	// true the full line shows and solutionAnnotations displaces annotations
	// per position. `authorView` (editors/browse) tints the answer segment of
	// the move line so authors see what study hides.
	let { board, minWidth = "409px", flushBottom = false, revealed = true, authorView = false, children } = $props();

	let normalized = $derived(normalizeBoard(board));
	let replay = $derived(replayMoves(normalized));
	// clamped: a solutionFrom beyond the (possibly failed) replay hides nothing
	let solutionFrom = $derived(
		normalized.solutionFrom == null
			? null
			: Math.min(normalized.solutionFrom, replay.moveInfos.length)
	);
	let visiblePlies = $derived(
		revealed || solutionFrom == null ? replay.moveInfos.length : solutionFrom
	);
	let positions = $derived(replay.fens.slice(0, visiblePlies + 1));
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
		replay.moveInfos.slice(0, visiblePlies).forEach(({ san, color }, index) => {
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

	// on reveal the solution layer displaces the question annotations wherever
	// it has an entry for the position
	let displayedAnnotation = $derived(
		revealed
			? normalized.solutionAnnotations[displayIndex] ?? normalized.annotations[displayIndex]
			: normalized.annotations[displayIndex]
	);

	$effect(() => {
		const fen = positions[displayIndex];
		const annotation = displayedAnnotation;
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
		// move line match the board's real rendered width exactly.
		// offsetWidth, not getBoundingClientRect: a board mounting mid
		// flip-animation is scaled, and rect widths include transforms — the
		// too-wide measurement would stick (no further layout resize fires
		// the observer). The outer element is observed as well, so a cell
		// resize re-measures even if cm-chessboard replaces the inner box.
		const syncWidth = () => wrapperElement.style.setProperty(
			"--board-px", chessboardElement.firstElementChild.offsetWidth + "px"
		);
		syncWidth();
		const resizeObserver = new ResizeObserver(syncWidth);
		resizeObserver.observe(chessboardElement.firstElementChild);
		resizeObserver.observe(chessboardElement);
		chessboardElement.addEventListener("wheel", handleWheel, { passive: false });
		return () => {
			chessboardElement.removeEventListener("wheel", handleWheel);
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

	// note for the responsive pass: on touch there is no wheel/keyboard, so
	// tap zones on the board halves may come back for touch input only —
	// desktop clicks stay reserved for future piece interaction on cards

	// scroll steps through the moves (lichess-style); deltas accumulate so
	// trackpads don't fire a step per micro-tick, and page scroll is always
	// swallowed over a board with moves. Attached manually: svelte's wheel
	// handlers are passive, which forbids preventDefault.
	let wheelAcc = 0;
	let lastWheel = 0;
	const handleWheel = e => {
		if (!hasMoves) return;
		e.preventDefault();
		const now = performance.now();
		if (now - lastWheel > 250) wheelAcc = 0;
		lastWheel = now;
		wheelAcc += e.deltaY;
		if (wheelAcc > 40) {
			next();
			wheelAcc = 0;
		} else if (wheelAcc < -40) {
			previous();
			wheelAcc = 0;
		}
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
		onclick={hasMoves ? () => wrapperElement.focus({ preventScroll: true }) : undefined}
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
							title={authorView && solutionFrom != null && move.index >= solutionFrom
								? "Revealed when the card is turned"
								: undefined}
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
	/* Containment breaks a sizing feedback loop: the rendered svg and the
	   --board-px-wide bar/move line all have fixed pixel widths, which would
	   otherwise feed the surrounding cell's min-content — locking the cell
	   at whatever width the board once rendered at (the cell then never
	   shrinks, the board never re-renders smaller, and the drag shadow's
	   correct size mismatches the real one, making drops snap dirty). With
	   inline-size containment the cell sizes the board, never the reverse. */
	.board-wrapper {
		display: flex;
		flex-direction: column;
		contain: inline-size;
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
		/* a stale-wide --board-px (measured mid-transition) must never widen
		   the row past the wrapper; the observer corrects it a frame later */
		max-width: 100%;
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
