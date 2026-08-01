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

	// The tabs study and edit this copy in place — a graded card, a renamed
	// deck — so a fresh server load (settings resetting the deck's progress,
	// say) has to land in the same object rather than replace it: every tab
	// took this exact one out of context and would go on reading the old
	// cards. Only a re-run of the layout's load changes data.deck, so this
	// does not fight the local edits between them.
	$effect(() => { Object.assign(deck, data.deck) });

	// In-progress card state for the editor-trial and browse tabs. It lives
	// here, in the layout that stays mounted across tab navigation, so
	// switching tabs doesn't wipe a half-written card; leaving the deck
	// discards it (after the warning below). The Add cards tab is not in
	// here: it keeps its draft in localStorage (add-cards-draft.js), which
	// survives leaving the deck and a reload, so it needs no warning.
	const cardDrafts = $state({ addCards: null, browse: null });
	setContext("cardDrafts", cardDrafts);

	// Which card is showing its answer in study. Here, so leaving the tab and
	// coming back does not put a revealed answer back behind its question:
	// you have seen it, and the grade should say so. Keyed by card id, so it
	// lapses the moment the card does.
	const studyState = $state({ turnedCardId: null });
	setContext("studyState", studyState);

	// v1-style drafts (block arrays with lazy text editors) needing a flush
	// before navigation; the browse edit (CardBlockEdit) persists its own
	// documents into its session bag on unmount instead
	const draftSides = () => [
		...(cardDrafts.addCards ? [cardDrafts.addCards.front, cardDrafts.addCards.back] : []),
		...(cardDrafts.addCards2 ? [cardDrafts.addCards2.blocks] : [])
	];

	// tab names (as shown in the nav) holding unsaved work, for the warning
	const unsavedPlaces = () => [
		...(cardDrafts.addCards
			&& (sideHasContent(cardDrafts.addCards.front) || sideHasContent(cardDrafts.addCards.back))
			? ["Add cards 5"] : []),
		...(cardDrafts.addCards2 && sideHasContent(cardDrafts.addCards2.blocks)
			? ["Add cards 2"] : []),
		...(cardDrafts.browse?.editingCardId != null ? ["Cards"] : [])
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
	// marketplace deck instances are readonly, so no editing tabs; settings is
	// there for the one thing that is theirs, resetting their study progress.
	// the editor trials (add-cards-2/-3/-5) keep their routes but not their
	// tabs: the block editor won, and only it is offered
	const paths = deck.isMarketplace
		? ["study", "browse", "settings"]
		: ["study", "browse", "add-cards", "settings"];
	const names = deck.isMarketplace
		? ["Study", "Cards", "Settings"]
		: ["Study", "Cards", "Add cards", "Settings"];

	// s/b/a jump between the deck's three working tabs. Bare letters, so they
	// stand down wherever the keyboard is already spoken for — a text field, a
	// card editor, or any modifier combo — the way study's own e/h/1-4 do.
	const TAB_KEYS = { s: "study", b: "browse", a: "add-cards" };
	const shortcutFor = path => Object.keys(TAB_KEYS).find(key => TAB_KEYS[key] === path);
	const handleKeyDown = e => {
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		const path = TAB_KEYS[e.key.toLowerCase()];
		if (!path || !paths.includes(path)) return;
		const target = e.target;
		if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable) return;
		const to = `/my-flashcards/${page.params.id}/${path}`;
		if (page.url.pathname === to) return;
		e.preventDefault();
		goto(to);
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

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
				<!-- the app's own tooltip, not a title: the browser places
				     those itself and they land off the mark -->
				{#if shortcutFor(path)}
					<span class="tooltip" aria-hidden="true">Shortcut key: {shortcutFor(path)}</span>
				{/if}
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
		color: var(--accent-text) !important;
		background-color: var(--accent) !important;
	}
	.tabs > a:hover {
		background-color: rgba(0, 0, 0, 0.05);
	}
	/* the card type pills' tooltip, hung under the tab */
	.tabs .tooltip {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		width: max-content;
		background-color: black;
		color: white;
		font-size: 13px;
		font-weight: 500;
		padding: 5px 10px;
		border-radius: 4px;
		opacity: 0;
		visibility: hidden;
		pointer-events: none;
		transition: opacity 100ms ease 300ms, visibility 0ms 300ms;
		z-index: 30;
	}
	.tabs > a:hover .tooltip {
		opacity: 1;
		visibility: visible;
	}
	/* the :active transform below makes the tab a stacking context, which
	   would trap the tooltip beneath the page — lift it while it can show */
	.tabs > a:hover,
	.tabs > a:active {
		z-index: 30;
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
