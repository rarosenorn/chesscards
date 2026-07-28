<script>
	import { page } from "$app/state"
	import FormErrors from "$lib/components/FormErrors.svelte"

	let { data, children } = $props();

	const tabs = [
		{ path: "description", name: "Description" },
		{ path: "cards", name: "Sample cards" }
	];
</script>

<div class="deck-header">
	<img class="thumbnail" src="/marketplace/{data.mpDeck.id}/thumbnail" alt={data.mpDeck.name} />
	<div class="deck-side">
		<h2>{data.mpDeck.name}</h2>
		<div class="deck-info">
			<p><span>Author:</span> {data.mpDeck.author}</p>
			<p class="theme"><span>Theme:</span> {data.mpDeck.theme}</p>
			<p><span>No. of cards:</span> {data.mpDeck.cardCount}</p>
		</div>
		{#if data.alreadyOwned}
			<p class="owned-note">You already have this deck. <a href="/my-flashcards">Go to My flashcards</a></p>
		{:else}
			<form method="POST" action="/marketplace/{data.mpDeck.id}/description?/getDeck">
				<button class="std-btn">{Number(data.mpDeck.price) === 0 ? "Get for free" : `Buy for ${data.mpDeck.price}$`}</button>
			</form>
		{/if}
	</div>
</div>
<FormErrors form={page.form} />
<div class="tabs">
	{#each tabs as tab}
		<a
			href="/marketplace/{data.mpDeck.id}/{tab.path}"
			aria-current={page.url.pathname === `/marketplace/${data.mpDeck.id}/${tab.path}`}
		>
			{tab.name}
		</a>
	{/each}
</div>
{@render children()}

<style>
	.deck-header {
		display: flex;
		gap: 30px;
		align-items: start;
	}
	.thumbnail {
		width: 300px;
		aspect-ratio: 3 / 2;
		object-fit: cover;
		border-radius: 4px;
	}
	h2 {
		font-size: 1.3rem;
	}
	.deck-info {
		margin-top: 8px;
		color: rgba(0, 0, 0, 0.6);
	}
	.theme {
		text-transform: capitalize;
	}
	.deck-side {
		height: 200px;
		display: flex;
		flex-direction: column;
	}
	.deck-info p {
		margin: 0 0 6px 0;
	}
	.deck-info span {
		font-weight: 600;
	}
	.deck-side form,
	.owned-note {
		margin-top: auto;
		margin-bottom: auto;
	}
	.tabs {
		margin-top: 24px;
		border-bottom: 1px solid #e3e1e1;
		display: flex;
		gap: 8px;
	}
	.tabs > a {
		text-decoration: none;
		color: rgba(0, 0, 0, 0.6);
		font-weight: 500;
		padding: 8px 12px;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
	}
	.tabs > a:hover {
		color: black;
		background-color: rgba(0, 0, 0, 0.03);
		border-radius: 4px 4px 0 0;
	}
	.tabs [aria-current]:not([aria-current="false"]) {
		color: black;
		font-weight: 600;
		border-bottom-color: var(--accent);
	}
</style>
