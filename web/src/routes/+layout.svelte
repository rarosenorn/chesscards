<script>
	import { setContext } from "svelte"
	import { browser } from "$app/environment"
	import { SCHEME_KEY, FONT_KEY, readPreview, applySchemeVars, applyFontVar } from "$lib/design-preview.js"
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

	// design tryouts (/design): a scheme or wordmark font being tried rides
	// along on every page until reset there
	if (browser) {
		const scheme = readPreview(SCHEME_KEY);
		if (scheme?.accent) applySchemeVars(scheme);
		const font = readPreview(FONT_KEY);
		if (font?.family) applyFontVar(font.family);
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="layout">
	<div id="topbar">
		<div class="left-nav">
			<a id="logo-anchor-tag" href="/"><Logo /><span>Chesscards</span></a>
			<nav>
				{#each [
					["/my-flashcards", "My flashcards"],
					["/marketplace", "Marketplace"],
					["/why-flashcards", "Why flashcards?"],
					["/faq", "FAQ"],
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
				color: white;
				position: relative;
				bottom: 2px;

				span {
					margin-left: 5px;
					font-family: var(--wordmark-font, roboto-mono);
					font-size: 1.7rem;
				}
			}
		}
		.right-nav {
			display: flex;
			align-items: center;
			gap: 6px;
			.nav-link {
				padding: 8px;
				color: rgba(255, 255, 255, 0.85);
				text-decoration: none;
				font-family: var(--wordmark-font, inherit);
				font-weight: 500;
			}
			.nav-link:hover {
				color: white;
				text-decoration: underline;
			}
			/* inverted on the blue bar: the filled accent button would vanish */
			.primary-btn {
				padding: 7px 16px;
				border-radius: 5px;
				font-size: 1rem;
				text-decoration: none;
				cursor: pointer;
				background-color: white;
				border: 1px solid white;
				color: var(--accent);
			}
			.primary-btn:hover {
				background-color: rgba(255, 255, 255, 0.9);
			}
		}
		nav {
			display: flex;
			gap: 6px;
			a {
				padding: 12px 8px;
				color: rgba(255, 255, 255, 0.85);
				text-decoration: none;
				font-family: var(--wordmark-font, inherit);
				font-weight: 500;
			}
			a:hover {
				color: white;
				text-decoration: underline;
			}
		}
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
