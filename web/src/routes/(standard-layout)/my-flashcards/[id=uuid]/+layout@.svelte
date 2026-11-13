<script module>
	// once per app load, across every deck the tab visits
	let editorWarmed = false;
	// the deck's tabs, a marketplace deck's without the editing one
	const PATHS = ["study", "browse", "add-cards", "deck", "settings"];
	const MARKETPLACE_PATHS = ["study", "browse", "deck", "settings"];
</script>

<script>
	import { page } from "$app/state"
	import { beforeNavigate, goto, preloadCode } from "$app/navigation"
	import { setContext } from "svelte"
	import DeckNavBar from "$lib/components/DeckNavBar.svelte"
	import { sideHasContent, syncTextBlocks } from "$lib/card-utils.js"
	import { confirmModal } from "$lib/modals.svelte.js"
	import { deckOutline } from "$lib/deck-tree.js"

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
	// lapses the moment the card does. `played` is how a tactic played on the
	// board came out, kept for its grade the same way.
	const studyState = $state({ turnedCardId: null, cram: null, played: null });
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

	// The editor (tiptap + the chessboard block + dnd) is a chunk of its own,
	// and waiting for it is the pause on study's e, on Cards and on Add cards.
	// The first editable deck warms it in the background once the page is
	// idle, so the first edit finds it already there. The flag is module-level
	// and the modules themselves stay loaded for the life of the tab, so this
	// happens once per app load — moving between decks does not redo it.
	$effect(() => {
		if (editorWarmed || deck.isMarketplace) return;
		editorWarmed = true;
		const warm = () => {
			const base = `/my-flashcards/${page.params.id}`;
			preloadCode(`${base}/browse`);
			preloadCode(`${base}/add-cards`);
			// study imports this one on demand; loading it here fills the
			// module cache its import() reads
			import("$lib/components/CardBlockEdit.svelte");
		};
		const idle = window.requestIdleCallback ?? (cb => setTimeout(cb, 200));
		idle(warm);
	});

	// set once the user confirmed leaving, so the re-navigation passes through
	let leaveConfirmed = false;

	// What is kept for this deck's pages goes when the deck is left. Turned to
	// another deck (the arrow, a name before it) the layout stays, so it is
	// let go here rather than with the layout.
	const discardDrafts = () => {
		cardDrafts.addCards = null;
		cardDrafts.addCards2 = null;
		cardDrafts.browse = null;
	}

	beforeNavigate(nav => {
		// live tiptap content only lives in the editor components; flush it
		// into block state before any navigation unmounts them
		for (const side of draftSides()) syncTextBlocks(side);

		const base = `/my-flashcards/${page.params.id}`;
		const path = nav.to?.url.pathname;
		if (path === base || path?.startsWith(base + "/")) return;
		const places = unsavedPlaces();
		// once for the navigation confirmed: the next deck left asks again
		if (leaveConfirmed || places.length === 0) {
			leaveConfirmed = false;
			discardDrafts();
			return;
		}
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
	let base = $derived(`/my-flashcards/${page.params.id}`);
	// the tab the page is on, or one of its pages (Add cards' import from a
	// game): its first step after the deck
	let tab = $derived(page.url.pathname.slice(base.length + 1).split("/")[0]);
	// The same tab of another deck, where that deck has it: a marketplace
	// deck taken, and the decks inside it, have no Add cards (nor do the pages
	// off the tabs travel), and those go to its Study.
	const tabOf = (id, bought) =>
		`/my-flashcards/${id}/${(bought ? MARKETPLACE_PATHS : PATHS).includes(tab) ? tab : "study"}`;

	// What the page can be turned to: the decks around this one, up to the
	// top of the list, and the decks inside it, as one outline, each on the
	// tab the page is on. A deck inside that its progression still holds
	// shut can be studied all the same.
	let switcher = $derived.by(() => {
		if (deck.ancestors.length === 0 && deck.decks.length === 1) return null;
		return {
			label: tab === "study" ? "Choose what to study" : "Choose a deck",
			options: [
				...deck.ancestors.map((around, index) => ({
					name: around.name, href: tabOf(around.id, around.bought), depth: index, current: false
				})),
				...deckOutline(deck.decks).map(({ deck: inside, level }) => ({
					name: inside.name,
					href: tabOf(inside.id, inside.bought),
					depth: deck.ancestors.length + level,
					current: inside.id === deck.id
				}))
			]
		};
	});

	// a marketplace deck taken, and the decks inside it, are readonly, so no
	// editing tabs; settings is there for what is theirs: how the decks
	// inside are taken, and resetting their study progress.
	// the editor trials (add-cards-2/-3/-5) keep their routes but not their
	// tabs: the block editor won, and only it is offered
	// (derived: the crumbs and the switcher lead from one deck to another
	// without leaving this layout)
	let paths = $derived(deck.isMarketplace ? MARKETPLACE_PATHS : PATHS);
	let names = $derived(deck.isMarketplace
		? ["Study", "Cards", "Deck", "Settings"]
		: ["Study", "Cards", "Add cards", "Deck", "Settings"]);

	// s/c/a/d/i jump between the deck's tabs (the bar listens for them).
	// Settings takes i, not its own t: a focused board answers t by turning
	// itself over.
	const TAB_KEYS = { s: "study", c: "browse", a: "add-cards", d: "deck", i: "settings" };
	const shortcutFor = path => Object.keys(TAB_KEYS).find(key => TAB_KEYS[key] === path);
</script>

<!-- The deck is named after the decks it sits inside, each the way to its
     own pages. -->
<DeckNavBar
	crumbs={[
		...deck.ancestors.map((around, index) => ({ name: around.name, href: tabOf(around.id, around.bought), separator: index ? "›" : "->" })),
		{ name: deck.name, separator: deck.ancestors.length ? "›" : "->" }
	]}
	tabs={paths.map((path, index) => ({
		name: names[index],
		href: `${base}/${path}`,
		current: page.url.pathname === `/my-flashcards/${page.params.id}/${path}`
			|| page.url.pathname.startsWith(`/my-flashcards/${page.params.id}/${path}/`),
		shortcut: shortcutFor(path)
	}))}
	{switcher}
/>

<!-- each deck's pages start afresh: turned to another deck, a page would
     otherwise go on with what it took from the deck before -->
{#key page.params.id}
	{@render children()}
{/key}
