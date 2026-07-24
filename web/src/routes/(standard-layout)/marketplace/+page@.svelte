<script>
	import StandardLayout from "$lib/components/StandardLayout.svelte"

	let { data } = $props();
</script>

<div class="marketplace-layout">
	<nav class="theme-nav">
		<a href="/marketplace" class:active={!data.activeTheme}>All</a>
		{#each data.themes as theme}
			<a href="/marketplace?theme={theme}" class:active={data.activeTheme === theme}>{theme}</a>
		{/each}
	</nav>
	<div class="page-column">
		<StandardLayout>
			<div class="marketplace-grid-container">
				{#each data.mpDecks as mpDeck (mpDeck.id)}
					<a href={`/marketplace/${mpDeck.id}`} class="deck-card">
						<img class="thumbnail" src="/marketplace/{mpDeck.id}/thumbnail" alt={mpDeck.name} />
						<div class="card-body">
							<p class="deck-name">{mpDeck.name}</p>
							<p class="deck-meta">{mpDeck.cardCount} cards</p>
							<div class="card-footer">
								<span class="theme-chip">{mpDeck.theme}</span>
								<span class="price" class:free={Number(mpDeck.price) === 0}>
									{Number(mpDeck.price) === 0 ? "Free" : `${mpDeck.price}$`}
								</span>
							</div>
						</div>
					</a>
				{/each}
			</div>
		</StandardLayout>
	</div>
</div>

<style>
	/* the deck column is centered in the viewport; the side columns absorb
	   the rest, with the theme nav sitting at the right edge of the left one */
	.marketplace-layout {
		display: grid;
		grid-template-columns: 1fr minmax(0, 1000px) 1fr;
		gap: 30px;
	}
	.theme-nav {
		display: flex;
		flex-direction: column;
		width: 150px;
		gap: 2px;
		/* container offset (25px) + heading strip height (71px): aligns with the top of
		   the content card/heading area (intentionally excludes the content padding) */
		margin-top: 96px;
		align-self: start;
		justify-self: end;
	}
	.theme-nav a {
		padding: 8px 12px;
		border-radius: 4px;
		color: rgba(0, 0, 0, 0.7);
		text-decoration: none;
		text-transform: capitalize;
	}
	.theme-nav a:hover {
		background-color: rgba(0, 0, 0, 0.07);
	}
	.theme-nav a.active {
		background-color: var(--accent);
		color: white;
	}
	.page-column {
		min-width: 0;
	}
	.marketplace-grid-container {
		display: grid;
		grid-template-columns: repeat(3, 300px);
		gap: 16px;
		align-content: start;
	}
	.deck-card {
		display: flex;
		flex-direction: column;
		text-decoration: none;
		color: inherit;
		background-color: white;
		border: 1px solid rgba(0, 0, 0, 0.08);
		border-radius: 10px;
		overflow: hidden;
		box-shadow: rgba(0, 0, 0, 0.05) 0px 1px 3px 0px;
		transition: box-shadow 150ms, transform 150ms;
	}
	.deck-card:hover {
		box-shadow: rgba(0, 0, 0, 0.12) 0px 4px 14px 0px;
		transform: translateY(-2px);
	}
	.thumbnail {
		width: 100%;
		aspect-ratio: 3 / 2;
		object-fit: cover;
	}
	.card-body {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 10px 12px 12px 12px;
	}
	.deck-name {
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.deck-meta {
		font-size: 0.85rem;
		color: rgba(0, 0, 0, 0.55);
	}
	.card-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 8px;
	}
	.theme-chip {
		font-size: 0.75rem;
		font-weight: 500;
		text-transform: capitalize;
		color: #35618e;
		background-color: var(--accent-subtle);
		border-radius: 999px;
		padding: 2px 10px;
	}
	.price {
		font-weight: 600;
		font-size: 0.9rem;
	}
	.price.free {
		color: var(--accent);
	}
</style>
