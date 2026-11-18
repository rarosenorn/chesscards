<script>
	import { enhance } from "$app/forms"
	import FormErrors from "$lib/components/FormErrors.svelte"
	import PayoutSettings from "$lib/components/PayoutSettings.svelte"
	import ReviewCounts from "$lib/components/ReviewCounts.svelte"
	import { isFree, formatPrice, formatCents } from "$lib/money.js"

	let { data, form } = $props();

	const date = value => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: data.timeZone });
	const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
	const listed = parts => parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;

	let paid = $derived(data.decks.filter(deck => !isFree(deck.price)));
	let totals = $derived({
		sales: paid.reduce((sum, deck) => sum + deck.sales, 0),
		refunds: paid.reduce((sum, deck) => sum + deck.refunds, 0),
		earnedCents: data.decks.reduce((sum, deck) => sum + deck.earnedCents, 0)
	});
	const status = deck => deck.takenDownReason ? "Taken down" : deck.onSale ? "On sale" : "Off sale";
</script>

<!-- the payouts say their own -->
<FormErrors form={form?.failed ? null : form} />
{#if data.decks.length === 0 && data.requests.length === 0}
	<p class="empty">
		You have no decks on the marketplace. To share one, open the deck's Settings in
		<a href="/my-flashcards">My flashcards</a> and choose Request upload to marketplace.
	</p>
{:else}
	{#if paid.length > 0}
		<p class="totals">
			{plural(totals.sales, "sale")}{#if totals.refunds > 0}, {totals.refunds} refunded{/if}
			· {formatCents(totals.earnedCents)} earned in all
		</p>
	{/if}

	<section class="decks">
		{#each data.decks as deck (deck.id)}
			<div class="deck">
				<a href="/marketplace/{deck.slug}">
					<img class="thumbnail" src="/marketplace/{deck.slug}/thumbnail" alt={deck.name} />
				</a>
				<div class="deck-body">
					<a class="deck-name" href="/marketplace/{deck.slug}">{deck.name}</a>
					<p class="line">
						<span class="status" class:off={status(deck) !== "On sale"}>{status(deck)}</span>
						· {formatPrice(deck.price)}
					</p>
					{#if deck.takenDownReason}
						<p class="note">Taken down by Chesscards: {deck.takenDownReason}</p>
					{/if}
					<p class="line">
						{#if !isFree(deck.price)}
							{plural(deck.sales, "sale")}{#if deck.refunds > 0}, {deck.refunds} refunded{/if}
							· {formatCents(deck.earnedCents)} earned ·
						{/if}
						{deck.holders === 1 ? "1 person has it" : `${deck.holders} people have it`} ·
						reviews: <ReviewCounts reviewCount={deck.reviewCount} recommendCount={deck.recommendCount} none="none" />
					</p>
					{#if deck.changes?.status === "pending"}
						<p class="note">Changes to the {listed(deck.changes.parts)} are waiting for review.</p>
					{:else if deck.changes?.status === "rejected"}
						<p class="note">Changes to the {listed(deck.changes.parts)} were rejected: "{deck.changes.rejectionReason}"</p>
					{/if}
					<div class="actions">
						{#if !deck.takenDownReason}
							<form method="POST" action="?/onSale" use:enhance>
								<input type="hidden" name="deckId" value={deck.id}>
								<input type="hidden" name="on-sale" value={!deck.onSale}>
								<button class="std-btn">{deck.onSale ? "Take off sale" : "Put back on sale"}</button>
							</form>
						{/if}
						<a class="std-btn" href="/author/{deck.id}/changes">Request changes</a>
					</div>
				</div>
			</div>
		{/each}
		{#each data.requests as request (request.id)}
			<div class="deck request">
				<div class="deck-body">
					<span class="deck-name">{request.name}</span>
					<p class="line">
						<span class="status off">{request.status === "pending" ? "Upload waiting for review" : "Upload rejected"}</span>
						· {formatPrice(request.price)}
					</p>
					{#if request.status === "rejected" && request.rejectionReason}
						<p class="note">"{request.rejectionReason}"</p>
					{/if}
				</div>
			</div>
		{/each}
	</section>

	{#if paid.length > 0}
		<section class="sales">
			<h3>Sales</h3>
			{#if data.sales.length === 0}
				<p class="note">No sales yet.</p>
			{:else}
				<ul>
					{#each data.sales as sale (sale.id)}
						<li>
							<span class="sale-date">{date(sale.createdAt)}</span>
							<a href="/marketplace/{sale.slug}">{sale.deckName}</a>
							<span>{formatCents(sale.priceCents)}</span>
							<span class="share">
								{sale.shareCents == null ? "your share is being worked out" : `your share ${formatCents(sale.shareCents)}`}
							</span>
							{#if sale.refunded}<span class="refunded">refunded</span>{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}

	{#if data.payouts}
		<PayoutSettings payouts={data.payouts} accountEmail={data.user.email} {form} />
	{/if}
{/if}

<style>
	.empty, .totals {
		margin: 0;
		color: rgba(0, 0, 0, 0.75);
	}
	.totals {
		margin-bottom: 18px;
	}
	/* the sales and the payouts (PayoutSettings' own section) under the decks */
	.decks ~ :global(section) {
		border-top: 1px solid rgba(0, 0, 0, 0.1);
		margin-top: 24px;
		padding-top: 18px;
	}
	h3 {
		margin: 0 0 10px 0;
		font-size: 1.05rem;
	}
	.decks {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.deck {
		display: flex;
		gap: 20px;
		align-items: start;
	}
	.thumbnail {
		display: block;
		width: 180px;
		aspect-ratio: 3 / 2;
		object-fit: cover;
		border-radius: 4px;
	}
	.deck-body {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: 6px;
		min-width: 0;
	}
	.deck-name {
		font-weight: 600;
		color: black;
	}
	.line, .note {
		margin: 0;
		font-size: 0.95rem;
		color: rgba(0, 0, 0, 0.75);
	}
	.note {
		max-width: 60ch;
		font-size: 0.9rem;
		color: rgba(0, 0, 0, 0.6);
	}
	.status {
		font-weight: 500;
		color: black;
	}
	.status.off {
		color: rgba(0, 0, 0, 0.6);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 4px;
	}
	.actions a {
		text-decoration: none;
		color: inherit;
	}
	.sales ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 0.95rem;
	}
	.sales li {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
	}
	.sale-date {
		min-width: 9ch;
		color: rgba(0, 0, 0, 0.6);
	}
	.share, .refunded {
		color: rgba(0, 0, 0, 0.6);
	}
	@media (max-width: 600px) {
		.deck {
			flex-direction: column;
		}
	}
</style>
