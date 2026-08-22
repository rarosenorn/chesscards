<script>
	// The wiki is one page with a section list down its left side: a section
	// is chosen in the URL (?section=), so a section can be linked and the
	// back button walks them. FAQ lives here now — it used to be its own top
	// nav entry, which put a handful of questions on the same footing as the
	// whole marketplace.
	import { page } from "$app/state"
	import Faq from "./Faq.svelte"

	const sections = [
		{ slug: "faq", title: "FAQ", component: Faq }
	];

	let current = $derived(
		sections.find(s => s.slug === page.url.searchParams.get("section")) ?? sections[0]
	);
</script>

<div class="wiki">
	<nav class="wiki-nav">
		<ul>
			{#each sections as section (section.slug)}
				<li>
					<a
						href="?section={section.slug}"
						class:current={section.slug === current.slug}
						aria-current={section.slug === current.slug ? "page" : undefined}
					>
						{section.title}
					</a>
				</li>
			{/each}
		</ul>
	</nav>
	<article class="wiki-body">
		<h2>{current.title}</h2>
		<current.component />
	</article>
</div>

<style>
	.wiki {
		display: flex;
		align-items: flex-start;
		gap: 28px;
	}
	/* the section list is the page's spine: a fixed column, ruled off from
	   the body so the two read as list and content rather than two columns */
	.wiki-nav {
		flex: none;
		width: 170px;
		border-right: 1px solid #e4e4e4;
		padding-right: 12px;
	}
	.wiki-nav ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.wiki-nav a {
		display: block;
		padding: 5px 10px;
		border-radius: 4px;
		color: #404040;
		text-decoration: none;
		font-size: 0.95rem;
	}
	.wiki-nav a:hover {
		background-color: #f2f2f2;
	}
	.wiki-nav a.current {
		background-color: var(--accent-subtle);
		color: var(--accent);
		font-weight: 500;
	}
	.wiki-body {
		flex: 1;
		min-width: 0;
	}
	.wiki-body h2 {
		margin: 0 0 14px 0;
		font-size: 1.2rem;
	}
</style>
