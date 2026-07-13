<script>
	import { ttGenerateHTML } from "../tiptap-utility.js"
	import Chessboard from "./Chessboard.svelte"

	let { card } = $props();
</script>

{#snippet side(side)}
	{#each side as block}
		{#if block.type === "text"}
			{@html ttGenerateHTML(block.content)}
		{:else if block.type === "chessboards"}
			<div 
				class={{
					"single-board-block": block.content.length < 2,
					"board-grid-block": block.content.length > 1
				}}
			>
				{#each block.content as chessboard}
					<div class="board-container">
						<Chessboard fen={chessboard} />
					</div>
				{/each}
			</div>
		{/if}
	{/each}
{/snippet}

<div class="flashcard">
	{@render side(card.front)}
	<hr class="divider">
	{@render side(card.back)}
</div>

<style>
	.flashcard {
		background-color: white;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 900px;
		border-radius: 5px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12),
		0 1px 2px rgba(0, 0, 0, 0.24);
		margin-top: 60px;
		min-height: 100px;
		padding: 24px 16px;
		padding-top: 36px;
		min-height: 750px;
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
</style>
