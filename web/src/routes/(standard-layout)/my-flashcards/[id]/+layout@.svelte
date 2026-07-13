<script>
	import { page } from "$app/state"
	import { setContext } from "svelte"

	let { data, children } = $props();

	// svelte-ignore state_referenced_locally
	let deck = $state(data.deck);
	setContext("deck", deck);
	// for decks from marketplace
	// const paths = ["study", "browse", "statistics", "",  "settings"];
	// const names= ["Study", "Browse", "Statistics", "Description", "Settings"];

	// for decks owned by me
	const paths = ["study", "browse", "add-cards", "settings"];
	const names= ["Study", "Browse / edit", "Add cards", "Settings"];
</script>

<div class="deck-nav-container">
	<div class="breadcrumbs">
		<a href="/my-flashcards">My flashcards</a>
		<span>{"->"}</span>
		<span>{deck.name}</span>
	</div>
	<div class="tabs">
		{#each paths as path, i}
			<a 
				href="/my-flashcards/{page.params.id}/{path}"
				aria-current={page.url.pathname === `/my-flashcards/${page.params.id}/${path}`} 
			>
				{names[i]}
			</a>
		{/each}
	</div>
</div>

{@render children()}

<style>
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
		color: white !important;
		background-color: steelblue !important;
	}
	.tabs > a:hover {
		background-color: rgba(0, 0, 0, 0.05);
	}
	.breadcrumbs a {
		color: black;
	}
	.breadcrumbs a:hover {
		color: blue;
	}
</style>
