<script>
	let { data } = $props();
</script>

<article>
	<p class="draft">Draft, to be reviewed before launch. Version {data.version}.</p>

	<h2>Who sells</h2>
	<p>
		Decks on the marketplace are sold by Jakobsen Software, which runs Chesscards. The authors
		license their decks to us; we sell them and pay the authors a share. Contact: {data.supportEmail}.
	</p>

	<h2>What you buy</h2>
	<p>
		A deck gives you lasting access to its cards in Chesscards, to study in the app. It isn't a
		download. If you delete it from My flashcards, you can add it back from the marketplace at no charge.
	</p>

	<h2>Prices</h2>
	<p>Prices are in US dollars and include VAT. Payment is handled by Stripe.</p>

	<h2>30-day money-back guarantee</h2>
	<p>
		Within 30 days of buying a deck, email {data.supportEmail} and we refund you in full, no
		questions asked. The guarantee applies once per deck. A refunded deck leaves your library,
		and your review of it is removed.
	</p>

	<h2>Right of withdrawal</h2>
	<p>
		EU law lets you cancel an online purchase within 14 days. Our 30-day guarantee covers this:
		to cancel, email {data.supportEmail} with the deck's name and that you want to cancel, and
		we refund you within 14 days.
	</p>
</article>

<style>
	article {
		max-width: 70ch;
		margin: 30px 0 80px 0;
	}
	h2 {
		font-size: 1.05rem;
		margin: 24px 0 6px 0;
	}
	p {
		margin: 0 0 12px 0;
		line-height: 1.5;
	}
	.draft {
		color: rgba(0, 0, 0, 0.55);
		font-size: 0.85rem;
	}
</style>
