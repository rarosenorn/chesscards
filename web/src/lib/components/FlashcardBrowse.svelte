<script>
	import { ttGenerateHTML } from "../tiptap-utility.js"
	import { countBoards, boardsBefore } from "../card-utils.js"
	import Chessboard from "./Chessboard.svelte"

	let { card } = $props();

	let frontBoardCount = $derived(countBoards(card.front));
	// board numbers are only shown when the card has several boards to reference
	let showBoardNumbers = $derived(frontBoardCount + countBoards(card.back) > 1);
</script>

{#snippet side(side, boardNumberOffset)}
	{#each side as block, blockIndex}
		{#if block.type === "text"}
			{@html ttGenerateHTML(block.content)}
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
						<Chessboard board={chessboard} minWidth={block.content.length < 2 ? "450px" : "409px"} />
					</div>
				{/each}
			</div>
		{/if}
	{/each}
{/snippet}

<div class="flashcard card-surface">
	{@render side(card.front, 0)}
	<hr class="divider">
	{@render side(card.back, frontBoardCount)}
</div>

<style>
	.flashcard {
		align-items: center;
		margin-top: 32px;
		margin-bottom: 40px;
		min-height: 200px;
		padding: 32px 32px 40px 32px;
	}
	.divider {
		width: 100%;
		border: none;
		border-top: 2px solid #e5e5e5;
		margin: 24px 0;
	}
	.single-board-block {
		display: flex;
		position: relative;
		flex-direction: column;
		align-items: center;
		padding-top: 10px;
	}
	.board-grid-block {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 20px;
		position: relative;
		padding-top: 10px;
	}
	.board-container {
		position: relative;
	}
</style>
