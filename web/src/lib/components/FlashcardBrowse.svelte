<script>
	import { boardAlignment, boardsAllAlone } from "$lib/side-alignment.js"
	import { ttGenerateHTML } from "../tiptap-utility.js"
	import { countBoards, boardsBefore, sideHasContent } from "../card-utils.js"
	import Chessboard from "./Chessboard.svelte"

	let { card } = $props();

	let frontBoardCount = $derived(countBoards(card.front));
	// board numbers are only shown when the card has several boards to reference
	let showBoardNumbers = $derived(frontBoardCount + countBoards(card.back) > 1);
</script>

{#snippet side(side, boardNumberOffset, authorView)}
<div
	class="card-side"
	data-board-align={boardAlignment(side)}
>
	{#each side as block, blockIndex}
		{#if block.type === "text"}
			<div class="text-block">
				{@html ttGenerateHTML(block.content)}
			</div>
		{:else if block.type === "chessboards"}
			<div
				class={{
					"single-board-block": block.content.length < 2,
					"board-grid-block": block.content.length > 1
				}}
			>
				{#each block.content as chessboard, boardIndex}
					<div class="board-container">
						<!-- low floor: two squeezed boards must shrink, not overflow
					     their cells and crush the gap between them -->
					<Chessboard board={chessboard} {authorView} minWidth="280px" number={showBoardNumbers ? boardNumberOffset + boardsBefore(side, blockIndex) + boardIndex + 1 : null} />
					</div>
				{/each}
			</div>
		{/if}
	{/each}
</div>
{/snippet}

<div
	class="flashcard card-surface"
	data-boards={boardsAllAlone(card) ? "solo" : null}
>
	{@render side(card.front, 0, true)}
	<!-- the divider only when the back has VISIBLE content — a card whose
	     answer lives on the front boards' back layers gets no delimiter -->
	{#if sideHasContent(card.back)}
		<div class="side-gap"></div>
	{/if}
	{@render side(card.back, frontBoardCount, false)}
</div>

<style>
	/* board/text layout inside the card comes from app.css ("card board
	   layout"), shared with the study page */
	.flashcard {
		align-items: center;
		margin-top: 32px;
		margin-bottom: 40px;
		/* the same floor the study card keeps, so a card does not change
		   size between the two views */
		min-height: var(--flashcard-min-height);
		/* the card's rim, a little wider than the divider's 18px between the
		   sides — same relation as on the study card */
		padding: 24px 46px;
	}
</style>
