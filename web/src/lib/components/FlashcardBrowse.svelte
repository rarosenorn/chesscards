<script>
	import { ttGenerateHTML } from "../tiptap-utility.js"
	import { countBoards, boardsBefore } from "../card-utils.js"
	import Chessboard from "./Chessboard.svelte"

	let { card } = $props();

	let frontBoardCount = $derived(countBoards(card.front));
	// board numbers are only shown when the card has several boards to reference
	let showBoardNumbers = $derived(frontBoardCount + countBoards(card.back) > 1);
</script>

{#snippet side(side, boardNumberOffset, authorView)}
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
						{#if showBoardNumbers}
							<p class="board-number">
								{boardNumberOffset + boardsBefore(side, blockIndex) + boardIndex + 1}
							</p>
						{/if}
						<!-- low floor: two squeezed boards must shrink, not overflow
					     their cells and crush the gap between them -->
					<Chessboard board={chessboard} {authorView} minWidth="280px" />
					</div>
				{/each}
			</div>
		{/if}
	{/each}
{/snippet}

<div class="flashcard card-surface">
	{@render side(card.front, 0, true)}
	{#if card.back.length > 0}
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
		min-height: 200px;
		padding: 32px 30px 40px 30px;
	}
</style>
