<script>
	import SvgPlaceholder from "./SvgPlaceholder.svelte"

	let { data } = $props();
</script>

<div class="marketplace-grid-container">
	{#each data.mpDecks as mpDeck (mpDeck.id)}
		<div>
			<a href={`/marketplace/${mpDeck.id}`}
				class="marketplace-grid-item"
			>
				<SvgPlaceholder />
				<p>{mpDeck.name}</p>
				<p>Number of cards: {mpDeck.marketplaceCards.length}</p>
			</a>
		</div>
	{/each}
</div>

<style>
	.marketplace-grid-container {
		display: grid;
		grid-template-columns: repeat(3, 300px);
		gap: 10px;
	}
	.marketplace-grid-item {
		display: flex;
		flex-direction: column;
		border: 2px solid gray;
		border-radius: 4px;
		padding: 5px;

		cursor: pointer;
		p {
			margin: 4px 0;
		}
	}
	.marketplace-grid-container :global(svg) {
		fill: var(--the-grey);
		stroke: var(--the-grey);
		width: 200px;
		margin: auto;
	}
</style>

