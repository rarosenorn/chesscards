<script>
	import { page } from "$app/state"
	import { beforeNavigate, goto } from "$app/navigation"
	import { setContext } from "svelte"
	import { sideHasContent, syncTextBlocks } from "$lib/card-utils.js"
	import { confirmModal } from "$lib/modals.svelte.js"

	let { data, children } = $props();

	// svelte-ignore state_referenced_locally
	let deck = $state(data.deck);
	setContext("deck", deck);

	// In-progress card state for the add-cards and browse tabs. It lives here,
	// in the layout that stays mounted across tab navigation, so switching
	// tabs doesn't wipe a half-written card; leaving the deck discards it
	// (after the warning below).
	const cardDrafts = $state({ addCards: null, browse: null });
	setContext("cardDrafts", cardDrafts);

	const draftSides = () => [
		...(cardDrafts.addCards ? [cardDrafts.addCards.front, cardDrafts.addCards.back] : []),
		...(cardDrafts.addCards2 ? [cardDrafts.addCards2.blocks] : []),
		...(cardDrafts.browse?.editingCardId ? [cardDrafts.browse.editFront, cardDrafts.browse.editBack] : [])
	];

	// tab names (as shown in the nav) holding unsaved work, for the warning
	const unsavedPlaces = () => [
		...(cardDrafts.addCards
			&& (sideHasContent(cardDrafts.addCards.front) || sideHasContent(cardDrafts.addCards.back))
			? ["Add cards 1"] : []),
		...(cardDrafts.addCards2 && sideHasContent(cardDrafts.addCards2.blocks)
			? ["Add cards 2"] : []),
		...(cardDrafts.browse?.editingCardId != null ? ["Browse / edit"] : [])
	];

	// set once the user confirmed leaving, so the re-navigation passes through
	let leaveConfirmed = false;

	beforeNavigate(nav => {
		// live tiptap content only lives in the editor components; flush it
		// into block state before any navigation unmounts them
		for (const side of draftSides()) syncTextBlocks(side);

		if (leaveConfirmed) return;
		const base = `/my-flashcards/${page.params.id}`;
		const path = nav.to?.url.pathname;
		if (path === base || path?.startsWith(base + "/")) return;
		const places = unsavedPlaces();
		if (places.length === 0) return;
		if (nav.willUnload) {
			nav.cancel(); // browser shows its own leave dialog
			return;
		}
		// beforeNavigate is synchronous: cancel now, re-navigate on confirm
		const to = nav.to?.url;
		nav.cancel();
		confirmModal({
			title: "Unsaved changes",
			message: `You have unsaved state in ${places.join(" and ")}. Leaving discards it.`,
			confirmLabel: "Leave",
			danger: true
		}).then(confirmed => {
			if (!confirmed || !to) return;
			leaveConfirmed = true;
			goto(to);
		});
	});
	// marketplace deck instances are readonly: study and browse only.
	// "Add cards 2" (single Q/A list) and "Add cards 3" (one tiptap document
	// per side, boards as PM nodes) are editor trials kept next to the classic
	// front/back editor for side-by-side comparison.
	const paths = deck.isMarketplace
		? ["study", "browse"]
		: ["study", "browse", "add-cards", "add-cards-2", "add-cards-3", "add-cards-5", "settings"];
	const names = deck.isMarketplace
		? ["Study", "Browse"]
		: ["Study", "Browse / edit", "Add cards 1", "Add cards 2", "Add cards 3", "Add cards 5", "Settings"];
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
		background-color: var(--accent) !important;
	}
	.tabs > a:hover {
		background-color: rgba(0, 0, 0, 0.05);
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
	.breadcrumbs a {
		color: black;
	}
	.breadcrumbs a:hover {
		color: blue;
	}
</style>
