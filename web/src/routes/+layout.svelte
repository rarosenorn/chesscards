<script>
	import favicon from '$lib/assets/favicon.svg';
	import Logo from "$lib/assets/Logo.svelte"
	import "../reset.css"
	import "../app.css"

	let { children, data } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="layout">
	<div id="topbar">
		<div class="left-nav">
			<a id="logo-anchor-tag" href="/"><Logo /><span>Chesscards</span></a>
			<nav>
				<a href="/my-flashcards">My flashcards</a>
				<a href="/statistics">Statistics</a>
				<a href="/marketplace">Marketplace</a>
				<a href="/why-flashcards">Why flashcards?</a>
				<a href="/faq">FAQ</a>
			</nav>
		</div>
		<div class="right-nav">
			{#if data.user?.email}
				<form method="POST" action="/logout">
					<button type="submit">Log out</button>
				</form>
			{:else}
				<a href="/login">Log in</a>
				<a href="/register">Register</a>
			{/if}
		</div>
	</div>
	<main>
		{@render children()}
	</main>
</div>

<style>
	.layout {
		display: flex;
		flex-direction: column;
	}
	#topbar {
		height: 72px;
		background-color: rgb(252, 252, 252);
		display: flex;
		justify-content: space-between;
		box-sizing: border-box;
		border-right: 1px solid rgba(0, 0, 0, 0.2);
		padding: 4px 50px;
		.left-nav {
			margin-top: 4px;
			display: flex;
			gap: 15px;
			align-items: center;
			#logo-anchor-tag {
				display: flex;
				align-items: center;
				text-decoration: none;
				color: rgba(0, 0, 0, 0.6);
				position: relative;
				bottom: 2px;

				span {
					margin-left: 5px;
					font-family: roboto-mono;
					font-size: 1.7rem;
				}
			}
		}
		.right-nav {
			margin-top: 5px;
			display: flex;
		}
		nav {
			display: flex;
			gap: 10px;
			a {
				padding: 12px 8px;
				color: rgba(0, 0, 0, 0.6);
				text-decoration: none;
			}
			a:hover {
				color: black;
				text-decoration: underline;
			}
		}
	}
	:global(.is-active) {
		color: black !important;
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
