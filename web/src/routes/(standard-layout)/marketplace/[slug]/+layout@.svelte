<script>
	import { page } from "$app/state"
	import FormErrors from "$lib/components/FormErrors.svelte"
	import StandardLayout from "$lib/components/StandardLayout.svelte"
	import ReviewCounts from "$lib/components/ReviewCounts.svelte"
	import OwnedBadge from "$lib/components/OwnedBadge.svelte"
	import { isFree, formatPrice } from "$lib/money.js"

	let { data, children } = $props();

	// the author owns their deck, and has it while they keep the one they
	// published it from
	const { owned, inLibrary } = $derived(data.ownership);
	const buying = $derived(!owned && !isFree(data.mpDeck.price));
	const priceLabel = $derived(isFree(data.mpDeck.price) ? "Get for free" : `Buy for ${formatPrice(data.mpDeck.price)}`);

	// a rename refused reopens the field with what was typed
	let renaming = $state(page.form?.rename !== undefined);

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
						<form method="POST" action="/marketplace/{data.mpDeck.slug}/overview?/getDeck">
							<button class="std-btn">Get</button>
						</form>
					{/if}
					{#if data.mpDeck.isAuthor && !data.mpDeck.takenDownReason}
						<form method="POST" action="/marketplace/{data.mpDeck.slug}/overview?/onSale">
							<input type="hidden" name="on-sale" value={!data.mpDeck.onSale}>
							<button class="std-btn">{data.mpDeck.onSale ? "Take off sale" : "Put back on sale"}</button>
						</form>
					{/if}
				{:else}
					<form method="POST" action="/marketplace/{data.mpDeck.slug}/overview?/getDeck">
						<button class="std-btn">{priceLabel}</button>
					</form>
					{#if buying}
						<a class="guarantee" href="/terms">30-day money-back guarantee</a>
					{/if}
				{/if}
				{#if data.mpDeck.isAuthor}
					{#if renaming}
						<form class="rename" method="POST" action="/marketplace/{data.mpDeck.slug}/overview?/rename">
							<input name="name" value={page.form?.rename ?? data.mpDeck.name} aria-label="New name">
							<button class="std-btn">Send for approval</button>
							<button type="button" class="std-btn" onclick={() => renaming = false}>Cancel</button>
						</form>
					{:else}
						<button class="std-btn" onclick={() => renaming = true}>Rename</button>
					{/if}
					{#if data.renameRequest?.status === "pending"}
						<p class="rename-note">Renaming to "{data.renameRequest.name}" is pending review.</p>
					{:else if data.renameRequest?.status === "rejected"}
						<p class="rename-note">Renaming to "{data.renameRequest.name}" was rejected: "{data.renameRequest.rejectionReason}".</p>
					{/if}
				{/if}
				{#if data.mpDeck.takenDownReason}
					<p class="taken-down">Taken down by Chesscards: {data.mpDeck.takenDownReason}</p>
				{/if}
				{#if data.user?.isAdmin}
					{#if data.mpDeck.takenDownReason}
						<form method="POST" action="/marketplace/{data.mpDeck.slug}/overview?/restore">
							<button class="std-btn">Restore</button>
						</form>
					{:else}
						<form class="take-down" method="POST" action="/marketplace/{data.mpDeck.slug}/overview?/takeDown">
							<input name="reason" required placeholder="Reason, sent to the author">
							<button class="std-btn">Take down</button>
						</form>
					{/if}
				{/if}
			</div>
		</div>
	</div>
	<FormErrors form={page.form} />
	<div class="tabs">
		{#each tabs as tab}
			<a
				href="/marketplace/{data.mpDeck.slug}/{tab.path}"
				aria-current={page.url.pathname.endsWith(`/${tab.path}`)}
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
	.taken-down, .rename-note {
		margin: 0;
		max-width: 46ch;
		font-size: 0.9rem;
	}
	.buy-row form.take-down, .buy-row form.rename {
		flex-direction: row;
		align-items: center;
	}
	.rename input {
		width: 32ch;
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
