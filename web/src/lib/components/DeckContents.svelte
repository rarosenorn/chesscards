<script>
	import { SvelteSet } from "svelte/reactivity"
	import { deckOutline, deckSubtree } from "$lib/deck-tree.js"

	// What a deck holds, for someone deciding whether to take it: the outline
	// of the decks inside it, each with how many cards sit under it. Under the
	// description on the marketplace page and on the Deck tab; a deck with no
	// decks inside has nothing to list. subdecks: the decks inside it, each
	// with the count of its own cards (those directly inside it at the top).
	let { subdecks } = $props();

	let rows = $derived(deckOutline(subdecks).map(({ deck, level, holdsDecks }) => {
		const inside = deckSubtree(subdecks, deck.id);
		const cards = subdecks.filter(other => inside.has(other.id)).reduce((sum, other) => sum + other.cards, 0);
		return { id: deck.id, name: deck.name, level: level + 1, cards, holdsDecks };
	}));

	const expanded = new SvelteSet();
	let foldable = $derived(rows.filter(row => row.holdsDecks));
	let allOpen = $derived(foldable.every(row => expanded.has(row.id)));
	const toggle = id => {
		if (!expanded.delete(id)) expanded.add(id);
	}
	const toggleAll = () => {
		if (allOpen) expanded.clear();
		else for (const row of foldable) expanded.add(row.id);
	}

	let visible = $derived.by(() => {
		const shown = [];
		let closedAt = null;
		for (const row of rows) {
			if (closedAt !== null && row.level > closedAt) continue;
			closedAt = row.holdsDecks && !expanded.has(row.id) ? row.level : null;
			shown.push(row);
		}
		return shown;
	});
</script>

{#if rows.length > 0}
	<section class="contents">
		<div class="head">
			<h3>Contents</h3>
			{#if foldable.length > 0}
				<button class="toggle-all" onclick={toggleAll}>{allOpen ? "Fold all" : "Expand all"}</button>
			{/if}
		</div>
		<ul>
			{#each visible as row (row.id)}
				<li class:top={row.level === 1} style:padding-left="{(row.level - 1) * 20}px">
					<span class="name">
						{#if foldable.length > 0}
							<button
								class="expander"
								class:open={expanded.has(row.id)}
								class:empty={!row.holdsDecks}
								aria-label={`${expanded.has(row.id) ? "Hide" : "Show"} the decks inside`}
								aria-expanded={expanded.has(row.id)}
								tabindex={row.holdsDecks ? 0 : -1}
								onclick={() => toggle(row.id)}
							></button>
						{/if}
						{row.name}
					</span>
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
	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 16px;
		padding-bottom: 8px;
		border-bottom: 1px solid #e3e1e1;
	}
	h3 {
		font-size: 1.1rem;
	}
	.toggle-all {
		padding: 0;
		border: none;
		background: none;
		cursor: pointer;
		font: inherit;
		font-size: 0.9rem;
		color: rgba(0, 0, 0, 0.55);
	}
	.toggle-all:hover {
		color: black;
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
	.expander {
		position: relative;
		width: 16px;
		height: 16px;
		margin-right: 4px;
		padding: 0;
		border: none;
		background: none;
		cursor: pointer;
		vertical-align: baseline;
		font: inherit;
		font-weight: 400;
		line-height: 16px;
		color: #404040;
	}
	.expander::before {
		content: "+";
	}
	.expander::after {
		content: "";
		position: absolute;
		inset: -4px -5px -4px -5px;
	}
	.expander.open::before {
		content: "\2212";
	}
	.expander:hover {
		color: black;
	}
	.expander.empty {
		visibility: hidden;
	}
	.cards {
		flex: none;
		font-size: 0.9rem;
		font-weight: 400;
		font-variant-numeric: tabular-nums;
		color: rgba(0, 0, 0, 0.55);
	}
</style>
