<script>
	import { deckOutline, deckSubtree } from "$lib/deck-tree.js"

	// What a deck holds, for someone deciding whether to take it: the outline
	// of the decks inside it, each with how many cards sit under it. Under the
	// description on the marketplace page and on the Deck tab; a deck with no
	// decks inside has nothing to list. subdecks: the decks inside it, each
	// with the count of its own cards (those directly inside it at the top).
	let { subdecks } = $props();

	let rows = $derived(deckOutline(subdecks).map(({ deck, level }) => {
		const inside = deckSubtree(subdecks, deck.id);
		const cards = subdecks.filter(other => inside.has(other.id)).reduce((sum, other) => sum + other.cards, 0);
		return { id: deck.id, name: deck.name, level: level + 1, cards };
	}));
</script>

{#if rows.length > 0}
	<section class="contents">
		<h3>Contents</h3>
		<ul>
			{#each rows as row (row.id)}
				<li class:top={row.level === 1} style:padding-left="{(row.level - 1) * 18}px">
					<span class="name">{row.name}</span>
					<span class="cards">{row.cards} {row.cards === 1 ? "card" : "cards"}</span>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.contents {
		margin-top: 25px;
	}
	/* a card of its own between the description's and the reviews', cut the
	   way DeckReviews cuts theirs: a strip of the page's grey across the
	   white card this sits in */
	.contents::before {
		content: "";
		display: block;
		height: 16px;
		margin: 0 -25px 25px;
		background-color: #efefef;
	}
	h3 {
		font-size: 1.1rem;
		padding-bottom: 8px;
		border-bottom: 1px solid #e3e1e1;
	}
	ul {
		list-style: none;
		padding: 0;
		margin-top: 8px;
		max-width: 560px;
	}
	li {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 16px;
		padding-top: 3px;
		padding-bottom: 3px;
		color: rgba(0, 0, 0, 0.75);
	}
	li.top {
		font-weight: 600;
		color: black;
	}
	.cards {
		flex: none;
		font-size: 0.9rem;
		font-weight: 400;
		font-variant-numeric: tabular-nums;
		color: rgba(0, 0, 0, 0.55);
	}
</style>
