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
	import { boardCaret } from "$lib/block-caret-state.svelte.js"
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
	// `number` is the board's display number, shown in the strip above it when
	// the card has more than one board (the block editor numbers with a CSS
	// counter instead — see CardSideBlockEditor — because numbering there runs
	// across blocks in document order).
	let { board, minWidth = "409px", flushBottom = false, revealed = true, authorView = false, number = null, children } = $props();

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
	// author view lists the whole line at all times (a divider marks where
	// the back begins); the eye only governs what the board itself shows,
	// so back moves are inert while it is closed
	let lineMoves = $derived(authorView ? replay.moveInfos : replay.moveInfos.slice(0, visiblePlies));

	let currentIndex = $state(0);
	// a different board (e.g. next flashcard) starts back at its start position
	$effect(() => { void board; currentIndex = 0; });
	let displayIndex = $derived(Math.min(currentIndex, positions.length - 1));

	// Whose move it is in the board's START position — the puzzle's premise,
	// which the position alone cannot show and a card's text may not say.
	// Deliberately not the position on screen: it is a property of the
	// diagram, and a marker flipping as you step would pull the eye. The
	// moves are on show while stepping anyway.
	let blackToMove = $derived(positions[0]?.split(" ")[1] === "b");

	// One-line move list, grouped so the line only wraps between pairs: each
	// pair is a number ("…" appended when black starts it, e.g. black moving
	// first or repeatedly) plus its move(s); each move keeps its move index so
	// clicking selects the position after it.
	let moveLine = $derived.by(() => {
		const pairs = [];
		let pairOpen = false;
		lineMoves.forEach(({ san, color }, index) => {
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
		// The bordered box is centered inside a fractional-width cell, so it
		// can land on a half pixel — the border then straddles the device
		// grid and the left/right edges rasterize thinner/blurrier than the
		// top/bottom. Nudge the whole wrapper (board, bar and move line move
		// together, keeping their alignment) so the box starts on a whole
		// device pixel.
		const snapToPixelGrid = () => {
			wrapperElement.style.transform = "";
			const rect = chessboardElement.firstElementChild.getBoundingClientRect();
			const dpr = window.devicePixelRatio || 1;
			const dx = (Math.round(rect.left * dpr) - rect.left * dpr) / dpr;
			const dy = (Math.round(rect.top * dpr) - rect.top * dpr) / dpr;
			if (dx || dy) wrapperElement.style.transform = `translate(${dx}px, ${dy}px)`;
		}
		const syncWidth = () => {
			wrapperElement.style.setProperty(
				"--board-px", chessboardElement.firstElementChild.offsetWidth + "px"
			);
			snapToPixelGrid();
		};
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
		// the gesture takes the board over, so hand it the keyboard too:
		// stepping on can continue with the arrow keys, as after a click
		wrapperElement.focus({ preventScroll: true });
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
		// while the block editor's virtual board caret is active, arrows
		// belong to it (the keydown also bubbles to ProseMirror's keymap —
		// stepping moves here would double-act). Only boards living in a
		// block can double-act: a board in study/browse has no editor above
		// it, and must keep stepping even if a caret was left set elsewhere.
		if (boardCaret.blockId != null && wrapperElement?.closest(".board-block")) return;
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
	<!-- The strip above every board: its number (when the card has more than
	     one) and the side to move, which takes the number's place on a lone
	     board. Always rendered, at a fixed height, so a board does not shift
	     when the number comes and goes. -->
	<div class="board-header">
		{#if number != null}<span class="board-number">{number}</span>{/if}
		<span
			class="side-to-move"
			class:black={blackToMove}
			role="img"
			aria-label={blackToMove ? "Black to move" : "White to move"}
		></span>
	</div>
	<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -- keyboard stepping lives on the focusable wrapper -->
	<div
		class="board"
		class:black-border={hasBlackBorder(boardPrefs())}
		class:flush-bottom={flushBottom}
		bind:this={chessboardElement}
		onclick={hasMoves ? () => wrapperElement.focus({ preventScroll: true }) : undefined}
	></div>
	{@render children?.()}
	{#if lineMoves.length > 0}
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
					<!-- the boundary marker precedes the pair number when the
					     back starts the pair ("Back: 2 e4"), and sits between
					     the moves when it starts mid-pair ("2 e4 Back: e5") -->
					{#if authorView && solutionFrom != null && pair.moves[0]?.index === solutionFrom}
						<span class="back-divider">Back:</span>
					{/if}
					<span class="move-number">{pair.number}</span>
					{#each pair.moves as move, moveIndex}
						{#if authorView && solutionFrom != null && moveIndex > 0 && move.index === solutionFrom}
							<span class="back-divider">Back:</span>
						{/if}
						<button
							class="move-btn"
							class:current={displayIndex === move.index + 1}
							disabled={authorView && !revealed && solutionFrom != null && move.index >= solutionFrom}
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
	/* the strip shares the board's exact width, so the number sits over the
	   board's left edge rather than the cell's */
	.board-header {
		display: flex;
		align-items: center;
		gap: 7px;
		/* the number's line box: held even when there is no number, so a board
		   sits at the same height whether or not the card numbers its boards */
		min-height: 1.26rem;
		margin-bottom: 2px;
		width: var(--board-px, 100%);
		max-width: 100%;
		margin-left: auto;
		margin-right: auto;
		padding-left: 6px;
		box-sizing: border-box;
	}
	/* the side to move, as a piece-coloured square: no wording to translate,
	   and it reads at a glance beside the number */
	.side-to-move {
		/* whole pixels, not rem: at a fractional size the border rasterizes
		   thicker on two sides and the square reads as a rectangle */
		width: 14px;
		height: 14px;
		background: white;
		/* the border carries the white square — without it the square would
		   vanish into the card surface — so it is drawn, not hinted at */
		border: 1px solid #262626;
		box-sizing: border-box;
	}
	.side-to-move.black {
		background: #262626;
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
	}
	/* the pair's two moves sit close together (the buttons' own padding
	   still separates them and keeps the hover pill intact) */
	.move-pair .move-btn + .move-btn {
		margin-left: -4px;
	}
	.move-btn {
		border: none;
		background-color: transparent;
		border-radius: 3px;
		padding: 1px 4px;
		cursor: pointer;
	}
	.move-btn:hover:enabled {
		background-color: gainsboro;
	}
	.move-btn:disabled {
		color: rgba(0, 0, 0, 0.35);
		cursor: default;
	}
	.move-btn.current {
		background-color: var(--accent);
		color: white;
	}
	/* the front/back boundary in the author view's always-complete line;
	   tucked toward what precedes it, spaced from what it introduces */
	.back-divider {
		align-self: center;
		font-size: 0.875rem;
		color: rgba(0, 0, 0, 0.45);
		margin-left: -2px;
		margin-right: 3px;
	}
	/* mid-pair ("1 e4 Back: d5") the following move hugs closer — a button
	   after the marker misses the pair's own tightening rule */
	.move-pair .move-btn + .back-divider {
		margin-right: -2px;
	}
</style>
