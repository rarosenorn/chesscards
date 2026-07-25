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
						<Chessboard board={chessboard} {authorView} minWidth="409px" />
					</div>
				{/each}
			</div>
		{/if}
	{/each}
{/snippet}

<div class="flashcard card-surface">
	<!-- authorView on the front: its boards' back-layer moves get their
	     "revealed when turned" tooltip -->
	{@render side(card.front, 0, true)}
	<hr class="divider">
	{@render side(card.back, frontBoardCount, false)}
</div>

<style>
	.flashcard {
		align-items: center;
		margin-top: 32px;
		margin-bottom: 40px;
		min-height: 200px;
		padding: 32px 30px 40px 30px;
	}
	.text-block {
		padding: 0 30px;
	}
	.divider {
		width: 100%;
		border: none;
		border-top: 2px solid #e5e5e5;
		margin: 24px 0;
	}
	/* boards breathe: extra space between board blocks and neighboring text */
	.single-board-block {
		display: flex;
		position: relative;
		flex-direction: column;
		align-items: center;
		margin: 26px 0;
	}
	/* a lone board keeps the same size as a 2-column grid cell, centered */
	.single-board-block > .board-container {
		width: calc(50% - 10px);
		/* a board wider than the half-width cell (Chessboard minWidth) must
		   grow the centered cell, not spill out one-sided */
		min-width: min-content;
	}
	.board-grid-block {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 20px;
		position: relative;
		margin: 26px 0;
	}
	.board-container {
		position: relative;
	}
</style>
