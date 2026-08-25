<script>
	import { setContext } from "svelte"
	import { browser } from "$app/environment"
	import { SCHEME_KEY, FONT_KEY, BANNER_KEY, CARD_KEY, readPreview, applySchemeVars, applyFontVar, applyBannerVariant, applyCardVars } from "$lib/design-preview.js"
	import favicon from '$lib/assets/favicon.svg';
	import Logo from "$lib/assets/Logo.svelte"
	import ModalHost from "$lib/components/ModalHost.svelte"
	import GlobalTooltip from "$lib/components/GlobalTooltip.svelte"
	import { DEFAULT_BOARD_PREFS } from "$lib/board-prefs.js"
	import "../reset.css"
	import "../app.css"

	let { children, data } = $props();

	// every chessboard in the app reads the user's board preferences from here
	// (a getter so consumers stay reactive to profile changes)
	setContext("boardPrefs", () => data.boardPrefs ?? DEFAULT_BOARD_PREFS);

	// design tryouts (/design): a scheme, menu font or banner variant being
	// tried rides along on every page until reset there
	if (browser) {
		const scheme = readPreview(SCHEME_KEY);
		if (scheme?.accent) applySchemeVars(scheme);
		const font = readPreview(FONT_KEY);
		if (font?.family) applyFontVar(font.family);
		const banner = readPreview(BANNER_KEY);
		if (banner?.variant) applyBannerVariant(banner.variant);
		const card = readPreview(CARD_KEY);
		if (card) applyCardVars(card);
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="layout">
	<div id="topbar">
		<div class="left-nav">
			<a id="logo-anchor-tag" href="/"><Logo /><span class="wordmark">Chesscards</span></a>
			<nav>
				{#each [
					["/my-flashcards", "My flashcards"],
					["/marketplace", "Marketplace"],
					["/why-flashcards", "Why flashcards?"],
					["/wiki", "Wiki"]
				] as [href, label]}
					<a {href}>{label}</a>
				{/each}
			</nav>
		</div>
		<div class="right-nav">
			{#if data.user?.email}
				<a class="nav-link" href="/profile">Settings</a>
			{:else}
				<a class="nav-link" href="/login">Log in</a>
				<a class="primary-btn" href="/register">Register</a>
			{/if}
		</div>
	</div>
	<main>
		{@render children()}
	</main>
</div>
<ModalHost />
<GlobalTooltip />

<style>
	.layout {
		display: flex;
		flex-direction: column;
	}
	#topbar {
		height: 72px;
		background-color: var(--accent);
		display: flex;
		justify-content: space-between;
		box-sizing: border-box;
		border-right: 1px solid rgba(0, 0, 0, 0.2);
		padding: 4px 50px;
		.left-nav {
			margin-top: 4px;
			display: flex;
			gap: 22px;
			align-items: center;
			#logo-anchor-tag {
				display: flex;
				align-items: center;
				text-decoration: none;
				color: var(--accent-text);
				position: relative;
				bottom: 2px;

				/* the wordmark wears the app face, bold and tight-set to match
				   the mark's ink — unity comes from weight/size/alignment, not
				   a display font. The /design font tryout dresses only the menu
				   links. */
				.wordmark {
					margin-left: 10px;
					font-weight: 700;
					letter-spacing: -0.02em;
					font-size: 1.6rem;
				}
			}
		}
		.right-nav {
			display: flex;
			align-items: center;
			gap: 6px;
			.nav-link {
				padding: 8px;
				color: color-mix(in srgb, var(--accent-text) 85%, transparent);
				text-decoration: none;
				font-family: var(--menu-font, inherit);
				font-weight: 600;
			}
			.nav-link:hover {
				color: var(--accent-text);
				text-decoration: underline;
			}
			/* inverted on the accent bar: the filled accent button would vanish */
			.primary-btn {
				padding: 7px 16px;
				border-radius: 5px;
				font-size: 1rem;
				text-decoration: none;
				cursor: pointer;
				background-color: var(--accent-text);
				border: 1px solid var(--accent-text);
				color: var(--accent);
			}
			.primary-btn:hover {
				background-color: color-mix(in srgb, var(--accent-text) 90%, transparent);
			}
		}
		nav {
			display: flex;
			gap: 6px;
			a {
				padding: 12px 8px;
				color: color-mix(in srgb, var(--accent-text) 85%, transparent);
				text-decoration: none;
				font-family: var(--menu-font, inherit);
				font-weight: 600;
			}
			a:hover {
				color: var(--accent-text);
				text-decoration: underline;
			}
		}
	}
	/* the white-banner tryout (html[data-banner="white"], set by design-preview):
	   the bar goes paper, so definition moves elsewhere — a hairline underneath,
	   a near-black wordmark, dark-grey links, and Register back to a normal
	   accent fill instead of the inverted one */
	:global(html[data-banner="white"]) #topbar {
		background-color: white;
		border-bottom: 1px solid rgba(0, 0, 0, 0.12);
	}
	:global(html[data-banner="white"]) #topbar #logo-anchor-tag {
		color: rgba(0, 0, 0, 0.85);
	}
	:global(html[data-banner="white"]) #topbar nav a,
	:global(html[data-banner="white"]) #topbar .nav-link {
		color: rgba(0, 0, 0, 0.65);
	}
	:global(html[data-banner="white"]) #topbar nav a:hover,
	:global(html[data-banner="white"]) #topbar .nav-link:hover {
		color: rgba(0, 0, 0, 0.9);
	}
	:global(html[data-banner="white"]) #topbar .primary-btn {
		background-color: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
	}
	:global(html[data-banner="white"]) #topbar .primary-btn:hover {
		background-color: var(--accent-hover);
	}
	main {
		background-color: #efefef;
		min-height: 100vh;
		padding-bottom: 100px;
		position: relative;
		flex-grow: 1;
		flex-shrink: 1;
		flex-basis: auto;
	}
</style>
