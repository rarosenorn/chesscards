<script>
	import DescriptionView from "./DescriptionView.svelte"
	import { CONTENTS_FROM, introHeadings } from "$lib/intros.js"

	// An intro page as it is read: what it introduces as the title, under the
	// names it sits inside (crumbs, outermost first, the last being the page
	// itself; one with an href or an onclick leads to that one's own intro),
	// a contents list once the page is long, then its text and boards. What
	// the host puts under the page (its Study button) is `children`; with
	// `editor`, that stands where the page would, under the same title.
	let { crumbs, blocks = null, editor = null, children } = $props();

	let headings = $derived(introHeadings(blocks));
	let body = $state();
	// the headings are found where they stand: the contents list and the
	// page are the same headings in the same order
	const goTo = index =>
		body?.querySelectorAll(".text-block :is(h2, h3)")[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
</script>

<article class="intro card-surface">
	<header>
		{#if crumbs.length > 1}
			<p class="trail">
				{#each crumbs.slice(0, -1) as crumb}
					{#if crumb.href}
						<a href={crumb.href}>{crumb.name}</a>
					{:else if crumb.onclick}
						<button onclick={crumb.onclick}>{crumb.name}</button>
					{:else}
						<span>{crumb.name}</span>
					{/if}
					<span aria-hidden="true">›</span>
				{/each}
			</p>
		{/if}
		<h1>{crumbs.at(-1).name}</h1>
	</header>
	{#if editor}
		<div class="editor">{@render editor()}</div>
	{:else}
		{#if headings.length >= CONTENTS_FROM}
			<nav class="contents" aria-label="Contents">
				<ol>
					{#each headings as heading, index}
						<li class:sub={heading.level > 1}>
							<button onclick={() => goTo(index)}>{heading.text}</button>
						</li>
					{/each}
				</ol>
			</nav>
		{/if}
		<div class="body" bind:this={body}>
			<DescriptionView blocks={blocks ?? []} />
		</div>
	{/if}
	{@render children?.()}
</article>

<style>
	.intro {
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
	.trail a,
	.trail button,
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
	.trail a:hover,
	.trail button:hover,
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
	.editor {
		margin-top: 16px;
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
