<script>
	import { page } from "$app/state"
	import { setContext } from "svelte"
	import DeckNavBar from "$lib/components/DeckNavBar.svelte"

	let { data, children } = $props();

	// As in a deck's layout: study grades this copy in place, so a fresh load
	// (the metadeck renamed, its study order changed) lands in the same
	// object rather than replacing the one the pages took out of context.
	// svelte-ignore state_referenced_locally
	let deck = $state(data.deck);
	setContext("deck", deck);
	$effect(() => { Object.assign(deck, data.deck) });

	// which card is showing its answer in study (see the deck's layout)
	const studyState = $state({ turnedCardId: null, cram: null });
	setContext("studyState", studyState);

	const base = $derived(`/my-flashcards/metadecks/${page.params.id}`);
	const paths = ["study", "settings"];
	const names = ["Study", "Settings"];

	// the letters a deck's tabs answer to (the bar listens for them)
	const TAB_KEYS = { s: "study", i: "settings" };
	const shortcutFor = path => Object.keys(TAB_KEYS).find(key => TAB_KEYS[key] === path);
</script>

<DeckNavBar
	crumbs={[{ name: deck.name }]}
	tabs={paths.map((path, index) => ({
		name: names[index],
		href: `${base}/${path}`,
		current: page.url.pathname === `${base}/${path}`,
		shortcut: shortcutFor(path)
	}))}
/>

{@render children()}
