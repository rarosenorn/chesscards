<script>
	import { page } from "$app/state"
	import FormErrors from "$lib/components/FormErrors.svelte"
	import StandardLayout from "$lib/components/StandardLayout.svelte"
	import ReviewCounts from "$lib/components/ReviewCounts.svelte"
	import OwnedBadge from "$lib/components/OwnedBadge.svelte"
	import DescriptionView from "$lib/components/DescriptionView.svelte"
	import DeckContents from "$lib/components/DeckContents.svelte"
	import DeckReviews from "$lib/components/DeckReviews.svelte"
	import FlashcardBrowse from "$lib/components/FlashcardBrowse.svelte"
	import { isFree, formatPrice } from "$lib/money.js"

	let { data, form } = $props();

	// the author owns their deck, and has it while they keep the one they
	// published it from; the page is the same for them as for anyone who has
	// it, as the deck is run from Your marketplace decks (/author)
	const { owned, inLibrary } = $derived(data.ownership);
	const buying = $derived(!owned && !isFree(data.mpDeck.price));
	const priceLabel = $derived(isFree(data.mpDeck.price) ? "Get for free" : `Buy for ${formatPrice(data.mpDeck.price)}`);

	let view = $state(page.url.searchParams.get("view") === "sample-cards" ? "sample-cards" : "overview");
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
		<img class="thumbnail" src="/marketplace/{data.mpDeck.slug}/thumbnail" alt={data.mpDeck.name} />
		<div class="deck-side">
			<div class="deck-info">
				<p><span>Author:</span> {data.mpDeck.author}</p>
				<p class="theme"><span>Theme:</span> {data.mpDeck.theme}</p>
				<p><span>No. of cards:</span> {data.mpDeck.cardCount}</p>
				<p>
					<span>Reviews:</span>
					<ReviewCounts reviewCount={data.mpDeck.reviewCount} recommendCount={data.mpDeck.recommendCount} none="None" />
				</p>
			</div>
			<div class="buy-row">
				{#if owned}
					<div class="owned-row">
						<button class="std-btn" disabled>{priceLabel}</button>
						<OwnedBadge />
					</div>
					{#if !inLibrary}
						<form method="POST" action="/marketplace/{data.mpDeck.slug}?/getDeck">
							<button class="std-btn">Get</button>
						</form>
					{/if}
				{:else}
					<form method="POST" action="/marketplace/{data.mpDeck.slug}?/getDeck">
						<button class="std-btn">{priceLabel}</button>
					</form>
					{#if buying}
						<a class="guarantee" href="/terms">30-day money-back guarantee</a>
					{/if}
				{/if}
				{#if data.user?.isAdmin}
					{#if data.mpDeck.takenDownReason}
						<p class="taken-down">Taken down by Chesscards: {data.mpDeck.takenDownReason}</p>
						<form method="POST" action="/marketplace/{data.mpDeck.slug}?/restore">
							<button class="std-btn">Restore</button>
						</form>
					{:else}
						<form class="take-down" method="POST" action="/marketplace/{data.mpDeck.slug}?/takeDown">
							<input name="reason" required placeholder="Reason, sent to the author">
							<button class="std-btn">Take down</button>
						</form>
					{/if}
				{/if}
			</div>
		</div>
	</div>
	<FormErrors {form} />
	<div class="tabs">
		<button class:active={view === "overview"} onclick={() => view = "overview"}>
			Overview
		</button>
		<button class:active={view === "sample-cards"} onclick={() => view = "sample-cards"}>
			Sample cards
		</button>
	</div>
	{#if view === "overview"}
		<DescriptionView blocks={data.mpDeck.description} />
		<DeckContents subdecks={data.contents} />
		<DeckReviews
			slug={data.mpDeck.slug}
			reviews={data.reviews}
			canReview={owned && !data.mpDeck.isAuthor}
			isAuthor={data.mpDeck.isAuthor}
			isAdmin={data.isAdmin}
		/>
	{:else}
		{#each data.previewCards as card (card.id)}
			<FlashcardBrowse {card} />
		{:else}
			<p class="no-preview">No preview cards</p>
		{/each}
	{/if}
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
	.buy-row form {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: 10px;
	}
	.owned-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.taken-down {
		margin: 0;
		max-width: 46ch;
		font-size: 0.9rem;
	}
	.buy-row form.take-down {
		flex-direction: row;
		align-items: center;
	}
	.guarantee {
		font-size: 0.85rem;
		color: rgba(0, 0, 0, 0.6);
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
	.tabs > button {
		border: none;
		background: none;
		cursor: pointer;
		color: rgba(0, 0, 0, 0.6);
		font-weight: 500;
		padding: 8px 12px;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
	}
	.tabs > button:hover {
		color: black;
		background-color: rgba(0, 0, 0, 0.03);
		border-radius: 4px 4px 0 0;
	}
	.tabs > button.active {
		color: black;
		font-weight: 600;
		border-bottom-color: var(--accent);
	}
	.no-preview {
		margin-top: 16px;
		color: rgba(0, 0, 0, 0.6);
	}
</style>
