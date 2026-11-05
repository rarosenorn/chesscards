<script>
	let { data } = $props();
</script>

<article>
	<p class="draft">Draft, to be reviewed before launch. Version {data.version}.</p>

	<h2>Who we are</h2>
	<p>
		Chesscards is run by Jakobsen Software, which sells decks on the marketplace to buyers and
		pays their authors a share. Contact: {data.supportEmail}.
	</p>

	<h2>Your deck</h2>
	<p>
		You keep the copyright to your deck and may sell it elsewhere. By publishing it, you give
		us a non-exclusive, worldwide licence to sell it on the Chesscards marketplace and to let
		its buyers use it in Chesscards for as long as Chesscards runs.
	</p>
	<p>
		You must have the rights to everything in it. Positions and moves from games are fine;
		text, diagrams or annotations copied from books, courses or other authors are not, unless
		you have their permission.
	</p>

	<h2>Your share</h2>
	<p>
		For each sale you earn 75% of the price after VAT and payment fees. A refund or a lost
		chargeback takes the sale's share back; the chargeback fee is ours.
	</p>

	<h2>Payouts</h2>
	<p>
		On the 1st of each month we pay you your share of the previous month's sales, by Wise to
		your payout email. Refunds of sales already paid are deducted from later payouts. If the
		total is under $10, it rolls over to the next month. You are responsible for tax on what
		you earn.
	</p>

	<h2>Taking a deck off sale</h2>
	<p>
		You can take your deck off sale and put it back at any time. We may take a deck down if it
		breaks this agreement or the law, and we tell you why. Either way, those who have the deck
		keep it.
	</p>

	<h2>Deleting your account</h2>
	<p>
		Your decks stay with those who have them, off sale, under the name you last had. What you
		have earned and not yet been paid is paid with the next monthly payout, whatever the
		amount, to the payout email you gave, which we keep until then.
	</p>

	<h2>Changes</h2>
	<p>We email you before this agreement changes.</p>
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
