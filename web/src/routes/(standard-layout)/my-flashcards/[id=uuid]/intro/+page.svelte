<script>
	import { getContext } from "svelte"
	import { page } from "$app/state"
	import IntroView from "$lib/components/IntroView.svelte"
	import { introPlaces } from "$lib/intros.js"
	import { saveIntro } from "$lib/deck.remote.js"

	// The intro page of a deck, or of one of its subdecks (?subdeck=<id>): the
	// page study shows before the first card there, and where the deck's
	// owner writes it.
	let deck = getContext("deck");
	// a marketplace deck instance's intros are its author's: read, not written
	let editable = $derived(!deck.isMarketplace);
	let base = $derived(`/my-flashcards/${page.params.id}`);

	// the deck's own, the last of the places, unless a subdeck is named
	let places = $derived(introPlaces(deck, page.url.searchParams.get("subdeck")));
	let place = $derived(places.at(-1));
	const hrefOf = (path, at) => `${base}/${path}${at.subdeckId ? `?subdeck=${at.subdeckId}` : ""}`;
	// The names above the title lead to their own intro pages: all of them
	// for the owner, who may be on the way to write one; a reader only to
	// the ones there are.
	let crumbs = $derived(places.map((at, index) => ({
		name: at.name,
		href: index < places.length - 1 && (editable || at.blocks) ? hrefOf("intro", at) : undefined
	})));

	let editor = $state(null);
	let errors = $state([]);

	// A page with nothing on it opens for writing: the owner came here to
	// write it. Another page (the names above) starts again from that.
	// svelte-ignore state_referenced_locally
	let editing = $state(editable && !place.blocks);
	// svelte-ignore state_referenced_locally
	let shownKey = place.key;
	$effect(() => {
		if (place.key === shownKey) return;
		shownKey = place.key;
		errors = [];
		editing = editable && !place.blocks;
	});

	// The editor (tiptap, the board editor, dnd) is a chunk of its own that
	// reading a page never needs, so it comes when the page is first edited.
	let DescriptionEditor = $state(null);
	let editorModule = null;
	$effect(() => {
		if (!editing || DescriptionEditor) return;
		editorModule ??= import("$lib/components/DescriptionEditor.svelte");
		editorModule.then(module => DescriptionEditor = module.default);
	});

	const save = async () => {
		const intro = editor.read();
		errors = intro.errors;
		if (errors.length > 0) return;
		const at = place;
		try {
			const blocks = await saveIntro({ deckId: deck.id, subdeckId: at.subdeckId, intro: intro.blocks });
			// into the shared deck, where study and this page read it
			if (at.subdeckId) deck.subdecks.find(subdeck => subdeck.id === at.subdeckId).intro = blocks;
			else deck.intro = blocks;
			editing = false;
		} catch (err) {
			console.error(err);
			errors = ["Could not save the intro. Check your connection and try again."];
		}
	}

	// e opens the editor, as on Cards and Deck; Ctrl+Enter saving is the
	// editor's own, window-wide
	const handleKeyDown = e => {
		if (!editable || editing) return;
		if (e.key !== "e" || e.ctrlKey || e.metaKey || e.altKey) return;
		const target = e.target;
		if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT" || target?.isContentEditable) return;
		e.preventDefault();
		editing = true;
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

{#snippet editorSide()}
	<!-- keyed: the names above lead to another page while this one is open -->
	{#key place.key}
		<DescriptionEditor bind:this={editor} blocks={place.blocks} headings onSubmit={save} />
	{/key}
	{#if errors.length > 0}
		<ul class="errors">
			{#each errors as error}
				<li>{error}</li>
			{/each}
		</ul>
	{/if}
{/snippet}

{#if editing && DescriptionEditor}
	<IntroView {crumbs} editor={editorSide} />
{:else if !editing}
	<IntroView {crumbs} blocks={place.blocks}>
		{#if !place.blocks}
			<p class="empty">No intro</p>
		{/if}
		<div class="study-row">
			<a class="std-btn" href={hrefOf("study", place)}>Study</a>
		</div>
	</IntroView>
{/if}

<!-- under the page, flush with its right edge, as Deck puts its own -->
{#if editable}
	<div class="actions">
		{#if editing}
			{#if place.blocks}
				<button type="button" class="std-btn" onclick={() => editing = false}>Cancel</button>
			{/if}
			<button type="button" class="std-btn" onclick={save}>Save</button>
		{:else}
			<button type="button" class="std-btn" onclick={() => editing = true}>Edit</button>
		{/if}
	</div>
{/if}

<style>
	.study-row {
		display: flex;
		justify-content: center;
		margin-top: 24px;
	}
	.study-row a {
		text-decoration: none;
		color: inherit;
	}
	.empty {
		margin: 16px 0;
		color: rgba(0, 0, 0, 0.5);
	}
	.errors {
		color: red;
		padding-left: 16px;
		margin: 12px 0 0 0;
	}
	/* the page's width (.card-surface), and Deck's spacing */
	.actions {
		display: flex;
		justify-content: end;
		gap: 8px;
		max-width: 900px;
		margin: 8px auto 0 auto;
	}
</style>
