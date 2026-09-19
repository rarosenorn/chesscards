<script>
	import { goto } from "$app/navigation"
	import { page } from "$app/state"
	import { deserialize } from "$app/forms"
	import SampleCardPicker from "$lib/components/SampleCardPicker.svelte"

	let { data } = $props();

	// svelte-ignore state_referenced_locally -- starting selection only; the picker edits it
	let previewIds = $state(data.previewCardIds.filter(id => data.deck.cards.some(card => card.id === id)));
	let errors = $state([]);

	// back to the Deck tab, on the sample cards this page was opened from
	const deckTab = `/my-flashcards/${page.params.id}/deck?view=sample-cards`;

	const save = async () => {
		errors = [];
		try {
			const formData = new FormData();
			formData.set("previewCardIds", JSON.stringify(previewIds));
			const response = await fetch("?/save", {
				method: "POST",
				headers: { "x-sveltekit-action": "true" },
				body: formData
			});
			const result = deserialize(await response.text());
			if (result.type === "success") {
				await goto(deckTab, { invalidateAll: true });
			} else {
				errors = result.data?.errors ?? ["Something went wrong. Please try again."];
			}
		} catch (err) {
			console.error(err);
			errors = ["Could not reach the server. Check your connection and try again."];
		}
	}
</script>

<div class="nav-container">
	<div class="breadcrumbs">
		<a href="/my-flashcards">My flashcards</a>
		<span>{"->"}</span>
		<a href={deckTab}>{data.deck.name}</a>
		<span>{"->"}</span>
		<span>Sample cards</span>
	</div>
</div>

<SampleCardPicker cards={data.deck.cards} bind:previewIds>
	{#snippet footer()}
		{#if errors.length > 0}
			<ul class="errors">
				{#each errors as error}
					<li>{error}</li>
				{/each}
			</ul>
		{/if}
		<div class="footer-buttons">
			<a class="std-btn" href={deckTab}>Cancel</a>
			<button type="button" class="std-btn" onclick={save}>Save</button>
		</div>
	{/snippet}
</SampleCardPicker>

<style>
	/* the request-upload page's nav bar */
	.nav-container {
		display: flex;
		box-shadow: inset 0 -4px 6px -4px rgba(0, 0, 0, 0.2);
		align-items: center;
		padding: 8px 30px;
		gap: 20px;
	}
	.breadcrumbs a {
		color: black;
	}
	.breadcrumbs a:hover {
		color: blue;
	}
	.errors {
		color: red;
		padding-left: 16px;
		margin: 0 0 8px 0;
	}
	.footer-buttons {
		display: flex;
		justify-content: end;
		gap: 8px;
	}
	.footer-buttons a {
		text-decoration: none;
		color: inherit;
	}
</style>
