<script>
	import { page } from "$app/state"
	import { goto } from "$app/navigation"
	import { zenHidden } from "$lib/zen-state.svelte.js"
	import { modalState } from "$lib/modals.svelte.js"

	// The bar under the site's, on the pages of a deck: the way back to My
	// flashcards and where you are, then the page's tabs.
	// crumbs: what follows "My flashcards", each { name, href?, separator? }
	// (the separator stands before it; "->" unless it says otherwise).
	// tabs: each { name, href, current, shortcut? }.
	// switcher: when the page shown can be turned to something else of the
	// same kind (a deck's Study, to a deck around it or inside it), an arrow after the
	// crumbs that opens the choice: { label, options }, each option
	// { name, href, depth, current }.
	let { crumbs, tabs, switcher = null } = $props();
	let switcherOpen = $state(false);

	// A tab's shortcut is a bare letter that jumps to it. It stands down
	// wherever the keyboard is already spoken for — a field that takes
	// typing, a card editor, or any modifier combo — the way study's own
	// e/h/1-4 do. A ticked box or a chosen pill takes no letters, so the
	// shortcuts go on working from those.
	const takesTyping = target =>
		target?.tagName === "TEXTAREA" || target?.isContentEditable
		|| (target?.tagName === "INPUT" && target.type !== "checkbox" && target.type !== "radio");
	const handleKeyDown = e => {
		if (e.key === "Escape") switcherOpen = false;
		// a modal owns the keyboard while it is up
		if (modalState.current || e.ctrlKey || e.metaKey || e.altKey) return;
		const tab = tabs.find(tab => tab.shortcut === e.key.toLowerCase());
		// already there, whatever else its link carries
		if (!tab || takesTyping(e.target) || page.url.pathname === tab.href.split("?")[0]) return;
		e.preventDefault();
		goto(tab.href);
	}

	// A crumb says its name in full on hover, but only while it is cut short:
	// the app's own tooltip (GlobalTooltip reads data-tip), kept in step with
	// whether the name fits as the bar is resized.
	const fullNameWhenCut = name => node => {
		const sync = () => {
			if (node.scrollWidth > node.clientWidth) node.dataset.tip = name;
			else delete node.dataset.tip;
		}
		const observer = new ResizeObserver(sync);
		observer.observe(node);
		sync();
		return () => observer.disconnect();
	}

	// The choice is a menu over the page, not part of it: it stops at the
	// window's bottom edge and scrolls itself, and opens on the deck shown.
	const fitToWindow = node => {
		const fit = () => {
			node.style.maxHeight = Math.max(120, window.innerHeight - node.getBoundingClientRect().top - 16) + "px";
		}
		fit();
		const current = node.querySelector("[aria-current]");
		if (current && current.offsetTop + current.offsetHeight > node.clientHeight)
			node.scrollTop = current.offsetTop - (node.clientHeight - current.offsetHeight) / 2;
		window.addEventListener("resize", fit);
		window.addEventListener("scroll", fit, { passive: true });
		return () => {
			window.removeEventListener("resize", fit);
			window.removeEventListener("scroll", fit);
		}
	}
</script>

<svelte:window
	onkeydown={handleKeyDown}
	onmousedown={e => { if (!e.target.closest?.(".switcher")) switcherOpen = false }}
/>

<div class="deck-nav-container" class:zen-hidden={zenHidden()}>
	<!-- Each name is a crumb of its own, cut short with an ellipsis when it
	     is long or the bar is tight, and then said in full on hover. -->
	<div class="breadcrumbs">
		<a href="/my-flashcards">My flashcards</a>
		{#each crumbs as crumb}
			<span>{crumb.separator ?? "->"}</span>
			{#if crumb.href}
				<a class="crumb" href={crumb.href} {@attach fullNameWhenCut(crumb.name)}>{crumb.name}</a>
			{:else}
				<span class="crumb" {@attach fullNameWhenCut(crumb.name)}>{crumb.name}</span>
			{/if}
		{/each}
		{#if switcher}
			<span class="switcher">
				<button
					class="switcher-toggle"
					class:open={switcherOpen}
					aria-label={switcher.label}
					aria-haspopup="menu"
					aria-expanded={switcherOpen}
					onclick={() => switcherOpen = !switcherOpen}
				></button>
				{#if switcherOpen}
					<div class="switcher-menu" role="menu" {@attach fitToWindow}>
						{#each switcher.options as option (option.href)}
							<a
								role="menuitem"
								href={option.href}
								aria-current={option.current ? "true" : undefined}
								style:padding-left="{12 + option.depth * 14}px"
								onclick={() => switcherOpen = false}
							>
								<span class="option-name">{option.name}</span>
							</a>
						{/each}
					</div>
				{/if}
			</span>
		{/if}
	</div>
	<div class="tabs">
		{#each tabs as tab}
			<a href={tab.href} aria-current={tab.current}>
				{tab.name}
				<!-- the app's own tooltip, not a title: the browser places
				     those itself and they land off the mark -->
				{#if tab.shortcut}
					<span class="tooltip" aria-hidden="true">Shortcut key: {tab.shortcut}</span>
				{/if}
			</a>
		{/each}
	</div>
</div>

<style>
	/* zen mode: the bar goes with the site bar above it, out of the flow
	   entirely — and comes back in it, so the card keeps its usual distance
	   from the chrome whenever the chrome is showing */
	.deck-nav-container.zen-hidden {
		display: none;
	}
	.deck-nav-container {
		display: flex;
		box-shadow: inset 0 -4px 6px -4px rgba(0, 0, 0, 0.2);
		align-items: center;
		padding-top: 8px;
		padding-left: 30px;
		gap: 20px;
	}
	.tabs {
		align-self: end;
		flex: none;
	}
	.tabs > a {
		display: inline-block;
		text-decoration: none;
		position: relative;
		color: black;
		background-color: white;
		border-radius: 4px 4px 0 0;
		cursor: pointer;
		margin-left: 5px;
		border: 1px solid #e3e1e1;
		border-bottom: none;
		padding: 0 16px;
		padding-top: 6px;
		padding-bottom: 3px;
	}
	.tabs [aria-current]:not([aria-current="false"]) {
		color: var(--accent-text) !important;
		background-color: var(--accent) !important;
	}
	.tabs > a:hover {
		background-color: rgba(0, 0, 0, 0.05);
	}
	/* the card type pills' tooltip, hung under the tab */
	.tabs .tooltip {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		width: max-content;
		background-color: black;
		color: white;
		font-size: 13px;
		font-weight: 500;
		padding: 5px 10px;
		border-radius: 4px;
		opacity: 0;
		visibility: hidden;
		pointer-events: none;
		transition: opacity 100ms ease 300ms, visibility 0ms 300ms;
		z-index: 30;
	}
	.tabs > a:hover .tooltip {
		opacity: 1;
		visibility: visible;
	}
	/* the :active transform below makes the tab a stacking context, which
	   would trap the tooltip beneath the page — lift it while it can show */
	.tabs > a:hover,
	.tabs > a:active {
		z-index: 30;
	}
	/* the std-btn key press: the tab dips into its bottom edge while held */
	.tabs > a:active {
		transform: translateY(1px);
		padding-bottom: 2px;
		background-color: rgba(0, 0, 0, 0.08);
	}
	.tabs [aria-current]:not([aria-current="false"]):active {
		background-color: var(--accent-hover) !important;
	}
	/* the crumbs give way before the tabs do: each name shrinks to an
	   ellipsis, the arrows between them and the way home never */
	.breadcrumbs {
		display: flex;
		align-items: baseline;
		gap: 0.3em;
		min-width: 0;
		white-space: nowrap;
	}
	.breadcrumbs > * {
		flex: none;
	}
	.breadcrumbs .crumb {
		flex: 0 1 auto;
		min-width: 2.5em;
		max-width: 26ch;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.breadcrumbs a {
		color: black;
	}
	.breadcrumbs a:hover {
		color: blue;
	}
	/* The arrow after the crumbs that opens the choice of what the page is
	   turned to, and the list it opens: hung under the arrow and as long as
	   it needs to be, the page scrolling for it. */
	.switcher {
		position: relative;
		align-self: center;
	}
	.switcher-toggle {
		display: block;
		width: 18px;
		height: 18px;
		padding: 0;
		border: none;
		background: none;
		cursor: pointer;
	}
	.switcher-toggle::before {
		content: "";
		display: block;
		width: 9px;
		height: 9px;
		margin: auto;
		background-color: rgba(0, 0, 0, 0.5);
		clip-path: polygon(0 17%, 100% 17%, 50% 83%);
	}
	.switcher-toggle:hover::before,
	.switcher-toggle.open::before {
		background-color: black;
	}
	.switcher-menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 30;
		min-width: 180px;
		max-width: 420px;
		overflow-x: hidden;
		overflow-y: auto;
		overscroll-behavior: contain;
		background-color: white;
		border: 1px solid #ccc;
		border-radius: 4px;
		box-shadow: rgba(0, 0, 0, 0.15) 0 2px 8px;
		padding: 4px;
	}
	.breadcrumbs .switcher-menu a {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 12px;
		color: #404040;
		text-decoration: none;
	}
	.breadcrumbs .switcher-menu a:hover {
		color: #404040;
		background-color: #f0f0f0;
	}
	/* the one being studied now */
	.switcher-menu a[aria-current="true"] {
		font-weight: 600;
	}
	.option-name {
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
