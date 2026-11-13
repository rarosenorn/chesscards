<script>
	import DescriptionView from "./DescriptionView.svelte"
	import { CONTENTS_FROM, articleHeadings } from "$lib/articles.js"

	// An article as it is read: in study the deck it sits in as the title,
	// under the names of the decks around that one (crumbs, outermost first,
	// the last being the title; none where it is shown as a card, in the
	// Cards tab), a contents list once the page is long, then its text and
	// boards. What the host puts under the page (study's Continue) is
	// `children`.
	let { crumbs = [], blocks = null, children } = $props();

	// each heading with its place among the page's, less the ones with no
	// words to list
	let headings = $derived(articleHeadings(blocks).map((heading, index) => ({ ...heading, index })).filter(heading => heading.text));
	let body = $state();
	// The headings are found where they stand: the list and the page are the
	// same headings in the same order — the ones in the page's own text, as
	// articleHeadings counts them, so not one inside a list.
	const goTo = index =>
		body?.querySelectorAll(".text-block > :is(h2, h3)")[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
</script>

<article class="article card-surface">
	{#if crumbs.length > 0}
		<header>
			{#if crumbs.length > 1}
				<p class="trail">
					{#each crumbs.slice(0, -1) as crumb}
						<span>{crumb.name}</span>
						<span aria-hidden="true">›</span>
					{/each}
				</p>
			{/if}
			<h1>{crumbs.at(-1).name}</h1>
		</header>
	{/if}
	{#if headings.length >= CONTENTS_FROM}
		<nav class="contents" aria-label="Contents">
			<ol>
				{#each headings as heading (heading.index)}
					<li class:sub={heading.level > 1}>
						<button onclick={() => goTo(heading.index)}>{heading.text}</button>
					</li>
				{/each}
			</ol>
		</nav>
	{/if}
	<div class="body" bind:this={body}>
		<DescriptionView blocks={blocks ?? []} />
	</div>
	{@render children?.()}
</article>

<style>
	.article {
		padding: 28px 32px 24px 32px;
		margin-top: 25px;
	}
	.trail {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		font-size: 0.9rem;
		color: rgba(0, 0, 0, 0.55);
		margin-bottom: 4px;
	}
	.contents button {
		color: inherit;
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		text-align: left;
		text-decoration: underline;
		text-decoration-color: rgba(0, 0, 0, 0.25);
		text-underline-offset: 3px;
		cursor: pointer;
	}
	.contents button:hover {
		color: black;
		text-decoration-color: currentColor;
	}
	h1 {
		font-size: 1.6rem;
		line-height: 1.25;
	}
	.contents {
		margin-top: 16px;
		padding: 10px 14px;
		border-left: 3px solid #ddd;
		font-size: 0.95rem;
		color: rgba(0, 0, 0, 0.7);
	}
	.contents ol {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.contents li.sub {
		padding-left: 18px;
	}
	/* a page reads from its left edge, every paragraph of it: the card's
	   centering of a lone short line is a card's */
	.body :global(.text-block > p) {
		width: auto;
		margin-inline: 0;
	}
	.body :global(.text-block :is(h2, h3)) {
		line-height: 1.3;
		margin: 1.5em 0 0.5em 0;
	}
	.body :global(.text-block h2) {
		font-size: 1.3rem;
	}
	.body :global(.text-block h3) {
		font-size: 1.08rem;
	}
	/* the page's first heading stands right under its title; one that opens a
	   later block (after a board) keeps some of its air */
	.body :global(.text-block > :is(h2, h3):first-child) {
		margin-top: 0.8em;
	}
	.body :global(.card-side > .text-block:first-child > :is(h2, h3):first-child) {
		margin-top: 0;
	}
</style>
