<script>
	import { page } from "$app/state"
	import FormErrors from "$lib/components/FormErrors.svelte"
	import StandardLayout from "$lib/components/StandardLayout.svelte"
	import ReviewCounts from "$lib/components/ReviewCounts.svelte"
	import OwnedBadge from "$lib/components/OwnedBadge.svelte"

	let { data, children } = $props();

	const tabs = [
		{ path: "overview", name: "Overview" },
		{ path: "cards", name: "Sample cards" }
	];
</script>

<!-- the way back to the marketplace, in the bar My flashcards' deck pages
     have theirs in; the page's title is the deck's name -->
<div class="deck-nav-container">
	<div class="breadcrumbs">
		<a href="/marketplace">Marketplace</a>
		<span>{"->"}</span>
		<span>{data.mpDeck.name}</span>
	</div>
</div>

<StandardLayout>
	<div class="deck-header">
		<img class="thumbnail" src="/marketplace/{data.mpDeck.id}/thumbnail" alt={data.mpDeck.name} />
		<div class="deck-side">
			<div class="deck-info">
				<p><span>Author:</span> {data.mpDeck.author}</p>
				<p class="theme"><span>Theme:</span> {data.mpDeck.theme}</p>
				<p><span>No. of cards:</span> {data.mpDeck.cardCount}</p>
				<p>
					<span>Reviews:</span>
					<ReviewCounts reviewCount={data.mpDeck.reviewCount} recommendCount={data.mpDeck.recommendCount} />
				</p>
			</div>
			<div class="buy-row">
				<form method="POST" action="/marketplace/{data.mpDeck.id}/overview?/getDeck">
					<button class="std-btn" disabled={data.alreadyOwned}>
						{Number(data.mpDeck.price) === 0 ? "Get for free" : `Buy for ${data.mpDeck.price}$`}
					</button>
				</form>
				{#if data.alreadyOwned}
					<OwnedBadge />
				{/if}
			</div>
		</div>
	</div>
	<FormErrors form={page.form} />
	<div class="tabs">
		{#each tabs as tab}
			<a
				href="/marketplace/{data.mpDeck.id}/{tab.path}"
				aria-current={page.url.pathname === `/marketplace/${data.mpDeck.id}/${tab.path}`}
			>
				{tab.name}
			</a>
		{/each}
	</div>
	{@render children()}
</StandardLayout>

<style>
	.deck-nav-container {
		box-shadow: inset 0 -4px 6px -4px rgba(0, 0, 0, 0.2);
		padding: 8px 30px;
	}
	.breadcrumbs a {
		color: black;
	}
	.breadcrumbs a:hover {
		color: blue;
	}
	.deck-header {
		display: flex;
		gap: 30px;
		align-items: start;
	}
	.thumbnail {
		width: 300px;
		aspect-ratio: 3 / 2;
		object-fit: cover;
		border-radius: 4px;
	}
	.deck-info {
		color: rgba(0, 0, 0, 0.6);
	}
	.theme {
		text-transform: capitalize;
	}
	.deck-side {
		display: flex;
		flex-direction: column;
	}
	.deck-info p {
		margin: 0 0 6px 0;
	}
	.deck-info span {
		font-weight: 600;
	}
	.buy-row {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: 10px;
		margin-top: 8px;
	}
	/* you have the deck already: greyed, and deaf to the hover and press of
	   a live button */
	.deck-side button:disabled {
		color: rgba(0, 0, 0, 0.4);
		pointer-events: none;
	}
	.tabs {
		margin-top: 24px;
		border-bottom: 1px solid #e3e1e1;
		display: flex;
		gap: 8px;
	}
	.tabs > a {
		text-decoration: none;
		color: rgba(0, 0, 0, 0.6);
		font-weight: 500;
		padding: 8px 12px;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
	}
	.tabs > a:hover {
		color: black;
		background-color: rgba(0, 0, 0, 0.03);
		border-radius: 4px 4px 0 0;
	}
	.tabs [aria-current]:not([aria-current="false"]) {
		color: black;
		font-weight: 600;
		border-bottom-color: var(--accent);
	}
</style>
