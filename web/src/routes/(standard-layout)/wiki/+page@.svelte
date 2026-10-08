<script>
	// The wiki is one page with a section list to the left of it, outside the
	// page's own card as the marketplace's themes are: a section is chosen in
	// the URL (?section=), so a section can be linked and the back button
	// walks them. FAQ lives here now — it used to be its own top
	// nav entry, which put a handful of questions on the same footing as the
	// whole marketplace.
	import { page } from "$app/state"
	import StandardLayout from "$lib/components/StandardLayout.svelte"
	import Faq from "./Faq.svelte"
	import Editor from "./Editor.svelte"
	import Srs from "./Srs.svelte"
	import AnnotationColors from "./AnnotationColors.svelte"
	import Shortcuts from "./Shortcuts.svelte"
	import GoodDeck from "./GoodDeck.svelte"

	const sections = [
		{ slug: "editor", title: "Editor", component: Editor },
		{ slug: "shortcuts", title: "Keyboard shortcuts", component: Shortcuts },
		{ slug: "srs", title: "SRS algorithm", component: Srs },
		{ slug: "annotation-colors", title: "Annotation colors", component: AnnotationColors },
		{ slug: "good-deck", title: "How to make a good flashcard deck", component: GoodDeck },
		{ slug: "faq", title: "FAQ", component: Faq }
	];

	let current = $derived(
		sections.find(s => s.slug === page.url.searchParams.get("section")) ?? sections[0]
	);
</script>

<div class="wiki-layout">
	<nav class="wiki-nav">
		{#each sections as section (section.slug)}
			<a
				href="?section={section.slug}"
				class:current={section.slug === current.slug}
				aria-current={section.slug === current.slug ? "page" : undefined}
			>
				{section.title}
			</a>
		{/each}
	</nav>
	<div class="page-column">
		<StandardLayout>
			<article class="wiki-body">
				<h2>{current.title}</h2>
				<current.component />
			</article>
		</StandardLayout>
	</div>
</div>

<style>
	/* As the marketplace lays itself out: the page's column is centred in
	   the window and the side columns take the rest, the section list
	   sitting at the right edge of the left one. */
	.wiki-layout {
		display: grid;
		grid-template-columns: 1fr minmax(0, 1000px) 1fr;
		gap: 30px;
	}
	.wiki-nav {
		display: flex;
		flex-direction: column;
		width: 190px;
		gap: 2px;
		/* a little under the top of the page's card (25px), so the first
		   section's words stand level with where the heading's padding ends */
		margin-top: 37px;
		align-self: start;
		justify-self: end;
	}
	.wiki-nav a {
		padding: 8px 12px;
		border-radius: 4px;
		color: rgba(0, 0, 0, 0.7);
		text-decoration: none;
	}
	.wiki-nav a:hover {
		background-color: rgba(0, 0, 0, 0.07);
	}
	.wiki-nav a.current {
		background-color: var(--accent);
		color: white;
	}
	.page-column {
		min-width: 0;
	}
	.wiki-body h2 {
		margin: 0 0 14px 0;
		font-size: 1.2rem;
	}
	/* the sections are their own components, so their prose is styled from
	   here: one reading measure and rhythm whatever the section */
	.wiki-body :global(p),
	.wiki-body :global(ul),
	.wiki-body :global(dl) {
		max-width: 70ch;
	}
	.wiki-body :global(h3) {
		margin: 26px 0 8px 0;
		font-size: 1rem;
	}
	.wiki-body :global(p) {
		margin: 0 0 10px 0;
		line-height: 1.55;
		color: #333;
	}
	.wiki-body :global(ul) {
		margin: 0 0 10px 0;
		padding-left: 22px;
		line-height: 1.55;
		color: #333;
	}
	.wiki-body :global(li) {
		margin-bottom: 3px;
	}
	.wiki-body :global(a) {
		color: var(--accent);
	}
</style>
