<script>
	import { getContext, setContext } from "svelte"
	import Cards from "$lib/components/Cards.svelte"
	import { metadeckOutline } from "$lib/metadecks.js"

	// The cards page reads a deck. It is given the metadeck in a deck's
	// shape: each of its decks a heading at the top of the outline, that
	// deck's subdecks and cards under it. Only to look through: the cards
	// are their decks', and are changed on those decks' own pages.
	const metadeck = getContext("deck");
	let subdecks = $derived(metadeckOutline(metadeck.parts));
	setContext("deck", {
		get id() { return metadeck.id },
		get name() { return metadeck.name },
		get subdecks() { return subdecks },
		get cards() { return metadeck.cards },
		isMetadeck: true,
		usesSubdecks: true,
		// the decks stand side by side here, none holding the next shut
		progressionDepth: 0
	});
</script>

<Cards />
