<script>
	import { onMount } from "svelte"
	import "cm-chessboard/assets/chessboard.css"
	import "cm-chessboard/assets/extensions/arrows/arrows.css"
	import "cm-chessboard/assets/extensions/markers/markers.css"
	import { Chessboard } from "cm-chessboard/src/Chessboard.js"
	import { Arrows } from "cm-chessboard/src/extensions/arrows/Arrows.js"
	import { Markers } from "cm-chessboard/src/extensions/markers/Markers.js"
	import { normalizeBoard } from "$lib/card-utils.js"
	import { getPositionFens, showAnnotations } from "$lib/board-utils.js"

	// `board` is a board object ({ fen, moves, annotations }) or a legacy FEN string
	let { board, minWidth = "409px", flushBottom = false } = $props();

	let normalized = $derived(normalizeBoard(board));
	let positions = $derived(getPositionFens(normalized));
	let hasMoves = $derived(positions.length > 1);

	let currentIndex = $state(0);
	// a different board (e.g. next flashcard) starts back at its start position
	$effect(() => { void board; currentIndex = 0; });
	let displayIndex = $derived(Math.min(currentIndex, positions.length - 1));

	let chessboardElement = $state();
	let cmBoard = $state();
	let renderedIndex = 0;

	$effect(() => {
		const fen = positions[displayIndex];
		const annotation = normalized.annotations[displayIndex];
		if (!cmBoard) return;
		// only animate actual navigation, not e.g. FEN edits of the shown position
		cmBoard.setPosition(fen, displayIndex !== renderedIndex);
		renderedIndex = displayIndex;
		showAnnotations(cmBoard, annotation);
	})

	onMount(() => {
		cmBoard = new Chessboard(chessboardElement, {
			position: positions[0],
			assetsUrl: "/chessboard-assets/", // wherever you copied the assets folder to, could also be in the node_modules folder
			extensions: [{ class: Arrows }, { class: Markers }]
		})
		return () => cmBoard.destroy();
	})

	const previous = () => { if (displayIndex > 0) currentIndex = displayIndex - 1; }
	const next = () => { if (displayIndex < positions.length - 1) currentIndex = displayIndex + 1; }

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

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
	style="min-width: {minWidth}"
	class="board-wrapper"
	tabindex={hasMoves ? 0 : undefined}
	role="group"
	aria-label={hasMoves ? "Chessboard, use arrow keys to step through moves" : "Chessboard"}
	onkeydown={hasMoves ? handleKeyDown : undefined}
>
	<div class="board" class:flush-bottom={flushBottom || hasMoves} bind:this={chessboardElement}></div>
	{#if hasMoves}
		<div class="nav-row" class:flush-bottom={flushBottom}>
			<button onclick={previous} disabled={displayIndex === 0} title="Previous move (←)">◀</button>
			<span class="nav-counter">{displayIndex} / {positions.length - 1}</span>
			<button onclick={next} disabled={displayIndex === positions.length - 1} title="Next move (→)">▶</button>
		</div>
	{/if}
</div>

<style>
	.board {
		border: 2px solid #404040;
		border-radius: 2px;
	}
	.board.flush-bottom {
		border-radius: 2px 2px 0 0;
	}
	.board-wrapper {
		display: flex;
		flex-direction: column;
	}
	.board-wrapper:focus-visible {
		outline: 2px solid #3584e4;
		outline-offset: 1px;
	}
	.nav-row {
		display: flex;
		align-items: stretch;
	}
	.nav-row > button {
		flex-grow: 1;
		border: 1px solid lightgrey;
		border-bottom: 1px solid darkgrey;
		background-color: #f5f5f5;
		cursor: pointer;
		padding: 2px 0;
	}
	.nav-row > button:hover:enabled {
		border: 1px solid darkgrey;
	}
	.nav-row > button:disabled {
		color: rgba(0, 0, 0, 0.3);
		cursor: default;
	}
	.nav-row > button:first-child {
		border-radius: 0 0 0 4px;
	}
	.nav-row > button:last-child {
		border-radius: 0 0 4px 0;
	}
	.nav-row.flush-bottom > button {
		border-radius: 0;
	}
	.nav-counter {
		align-self: center;
		padding: 0 10px;
		font-size: 0.85rem;
		color: rgba(0, 0, 0, 0.6);
		white-space: nowrap;
	}
</style>
