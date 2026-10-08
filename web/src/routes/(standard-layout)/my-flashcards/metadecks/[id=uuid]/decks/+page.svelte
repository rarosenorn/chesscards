<script>
	import { page } from "$app/state"
	import { invalidateAll } from "$app/navigation"
	import { SvelteSet } from "svelte/reactivity"
	import StandardLayout from "$lib/components/StandardLayout.svelte"
	import { holders } from "$lib/metadecks.js"
	import { setItems } from "../metadeck.remote.js"

	let { data } = $props();

	let metadeck = $derived(data.metadecks.find(candidate => candidate.id === page.params.id));
	// a metadeck never goes inside itself, nor inside one it holds: those are
	// not offered
	let closed = $derived(holders(data.metadecks, page.params.id));
	let groups = $derived([
		{ title: "Metadecks", kind: "metadeck", choices: data.metadecks.filter(candidate => !closed.has(candidate.id)) },
		{ title: "Marketplace decks", kind: "instance", choices: data.marketplaceDecks },
		{ title: "My decks", kind: "deck", choices: data.decks }
	].filter(group => group.choices.length > 0));

	// What it holds, as ticked: a tick lands here at once and is saved behind
	// it, and a load says it again from the server.
	let held = $derived(new SvelteSet(metadeck.items.map(item => item.id)));
	const heldOf = kind => groups.find(group => group.kind === kind)?.choices.map(choice => choice.id).filter(id => held.has(id)) ?? [];

	// Saves go one after another, each saying the whole of what was ticked
	// when it was made, so the last to land is the last made. The metadeck is
	// loaded afresh (study's cards among it) once nothing is left to save;
	// sooner, and the load would put back a tick made in the meantime.
	let saving = Promise.resolve();
	let unsaved = 0;
	const toggle = id => {
		if (!held.delete(id)) held.add(id);
		const items = { deckIds: heldOf("deck"), instanceIds: heldOf("instance"), metadeckIds: heldOf("metadeck") };
		unsaved++;
		const save = saving.then(() => setItems({ id: metadeck.id, ...items }));
		saving = save.catch(() => {}).then(async () => { if (--unsaved === 0) await invalidateAll(); });
		return save;
	}
</script>

<StandardLayout>
	<p class="section-note">
		Tick what {metadeck.name} holds. Studying it studies them together; the
		decks themselves stay where they are.
	</p>
	{#each groups as group (group.kind)}
		<section>
			<h3>{group.title}</h3>
			{#each group.choices as choice (choice.id)}
				<label>
					<input type="checkbox" checked={held.has(choice.id)} onchange={() => toggle(choice.id)} />
					{choice.name}
				</label>
			{/each}
		</section>
	{:else}
		<p class="section-note">You have no decks to put in it yet.</p>
	{/each}
</StandardLayout>

<style>
	section {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: 4px;
		padding: 18px 0;
	}
	section + section {
		border-top: 1px solid rgba(0, 0, 0, 0.1);
	}
	h3 {
		margin: 0 0 4px;
		font-size: 1.05rem;
	}
	.section-note {
		margin: 0;
		font-size: 0.9rem;
		color: rgba(0, 0, 0, 0.6);
	}
	label {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}
	input {
		accent-color: var(--accent);
	}
</style>
