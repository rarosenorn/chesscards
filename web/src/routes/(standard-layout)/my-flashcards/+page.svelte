<script>
	import { enhance } from "$app/forms"
	import { flip } from "svelte/animate"
	import FormErrors from "$lib/components/FormErrors.svelte"
	import { reorderDecks } from "./decks.remote.js"
	let { data, form } = $props();

	// the two lists as shown: a drop reorders them here at once, and a fresh
	// load (a deck created) replaces them
	// svelte-ignore state_referenced_locally -- seeded here, kept in step below
	let lists = $state({ market: data.marketplaceDecks, mine: data.decks });
	$effect(() => { lists = { market: data.marketplaceDecks, mine: data.decks } });

	// A row is dragged to reorder its own list. A press only becomes a drag
	// once the pointer has moved, so a click still opens the deck; while it
	// is on, the row is lifted out and a placeholder holds the slot it would
	// drop into.
	let drag = $state(null);
	let justDragged = false;

	const handleRowMouseDown = (e, list, deck) => {
		if (e.button !== 0) return;
		// no native link drag or text selection; the click still lands
		e.preventDefault();
		const index = lists[list].indexOf(deck);
		drag = {
			list, deck, started: false,
			startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY,
			rowHeight: e.currentTarget.getBoundingClientRect().height,
			from: index, over: index
		};
	}

	const handleWindowMouseMove = e => {
		if (!drag) return;
		drag.x = e.clientX;
		drag.y = e.clientY;
		if (!drag.started) {
			if (Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) <= 5) return;
			drag.started = true;
		}
		// the slot is read against the rows still standing, from their
		// layout positions (a row mid-flip is translated): before the first
		// row whose middle is below the cursor. Off the table, it goes home.
		const table = document.querySelector(`table[data-list="${drag.list}"]`);
		const box = table.getBoundingClientRect();
		if (e.clientY < box.top - 20 || e.clientY > box.bottom + 20 || e.clientX < box.left || e.clientX > box.right) {
			drag.over = drag.from;
			return;
		}
		const rows = [...table.querySelectorAll("tr[data-deck-row]")];
		const index = rows.findIndex(row => {
			const rect = row.getBoundingClientRect();
			const top = rect.top - new DOMMatrixReadOnly(getComputedStyle(row).transform).m42;
			return e.clientY < top + rect.height / 2;
		});
		drag.over = index === -1 ? rows.length : index;
	}

	const handleWindowMouseUp = async () => {
		const d = drag;
		if (!d) return;
		drag = null;
		if (!d.started) return;
		// the mouseup can still turn into a click on the row it ends over
		justDragged = true;
		setTimeout(() => justDragged = false);
		if (d.over === d.from) return;
		const before = lists[d.list];
		const rest = before.filter(deck => deck !== d.deck);
		lists[d.list] = [...rest.slice(0, d.over), d.deck, ...rest.slice(d.over)];
		try {
			await reorderDecks({ marketplace: d.list === "market", ids: lists[d.list].map(deck => deck.id) });
		} catch (err) {
			lists[d.list] = before;
			throw err;
		}
	}

	// what a table shows: while its row is lifted, the others with a
	// placeholder at the slot it would drop into
	const rowsOf = list => {
		if (drag?.list !== list || !drag.started) return lists[list];
		const rest = lists[list].filter(deck => deck !== drag.deck);
		return [...rest.slice(0, drag.over), { id: "__placeholder__", placeholder: true }, ...rest.slice(drag.over)];
	}
</script>

<svelte:window onmousemove={handleWindowMouseMove} onmouseup={handleWindowMouseUp} />

{#snippet deckTable(firstTableHeader, list)}
	<table data-list={list} class:reordering={drag?.started && drag.list === list}>
		<thead>
			<tr>
				<th>{firstTableHeader}</th>
				<th>New</th>
				<th>Learn</th>
				<th>Due</th>
				<th>Total</th>
			</tr>
		</thead>
		<tbody>
			{#each rowsOf(list) as deck (deck.id)}
				<!-- one tr for deck and placeholder alike: the animate directive
				     must sit directly under the keyed each -->
				<tr
					data-deck-row={deck.placeholder ? undefined : deck.id}
					class:placeholder-row={deck.placeholder}
					style:height={deck.placeholder ? `${drag.rowHeight}px` : undefined}
					animate:flip={{ duration: drag?.started ? 150 : 0 }}
					onmousedown={deck.placeholder ? undefined : e => handleRowMouseDown(e, list, deck)}
				>
					{#if deck.placeholder}
						<td colspan="5"></td>
					{:else}
						<td><a
							href={`my-flashcards/${deck.id}/study`}
							draggable="false"
							onclick={e => { if (justDragged) e.preventDefault() }}
						>
								{deck.name}
						</a></td>
						<td class="count new" class:none={deck.new_cards == 0}>{deck.new_cards}</td>
						<td class="count learn" class:none={deck.learn_cards == 0}>{deck.learn_cards}</td>
						<td class="count review" class:none={deck.review_cards == 0}>{deck.review_cards}</td>
						<td class:none={deck.no_cards == 0}>{deck.no_cards}</td>
					{/if}
				</tr>
			{/each}
		</tbody>
	</table>
{/snippet}

{#if drag?.started}
	<div class="drag-ghost" style="left: {drag.x + 14}px; top: {drag.y + 10}px">{drag.deck.name}</div>
{/if}

{@render deckTable("Marketplace decks", "market")}
{@render deckTable("My decks", "mine")}
<FormErrors form={form} />
<form method="POST" action="?/create" use:enhance>
	<input
		name="name"
		value={form?.name ?? ""}
		required
		minlength="4"
		maxlength="100"
		autocomplete="off"
	/>
	<button>Create</button>
</form>

<style>
	/* fixed shared column widths so both tables' columns line up */
	table {
		padding: 8px;
		border-collapse: collapse;
		margin-top: 12px;
		margin-bottom: 32px;
		table-layout: fixed;
		width: 100%;
	}
	th:nth-child(n + 2) {
		width: 65px;
	}
	th:nth-child(n + 2),
	td:nth-child(n + 2) {
		text-align: center;
	}
	th {
		text-align: left;
	}
	tbody td:first-child {
		padding-left: 4px;
	}
	/* the row-filling link overlay (table a::after) anchors here, making the
	   whole row one click target to match the full-row hover affordance */
	tbody tr {
		position: relative;
	}
	tbody > tr:hover {
		background-color: var(--accent-subtle);
	}
	tbody > tr {
		cursor: pointer;
	}
	td {
		padding: 2px 0;
	}
	/* the row is the affordance (full-row overlay + hover), so the deck name
	   reads as plain text: no link blue, no visited purple, no underline */
	table a {
		color: #404040;
		text-decoration: none;
		font-weight: 500;
	}
	table a::after {
		content: "";
		position: absolute;
		inset: 0;
	}
	/* where's work waiting: due count gets an accent pill, 0 recedes to grey */
	td.due {
		color: rgba(0, 0, 0, 0.45);
	}
	/* anki's deck browser colours, count by count: blue for new, rust for
	   what is being learned, green for the reviews coming round. Nothing
	   waiting is grey — the colour is the call to study */
	.count {
		font-weight: 500;
	}
	.count.new {
		color: #00a;
	}
	.count.learn {
		color: #c35617;
	}
	.count.review {
		color: #070;
	}
	/* an empty count recedes, the total included: nothing there to study. The
	   compound stays in the list to outrank .count.new and its siblings */
	.count.none,
	.none {
		color: rgba(0, 0, 0, 0.35);
		font-weight: 400;
	}
	/* section titles, larger than the deck rows they head */
	th:first-child {
		font-size: 1.05rem;
	}
	/* the create field belongs to the deck list it adds to, so it sits
	   closer to it than the two tables sit to each other */
	table:last-of-type {
		margin-bottom: 14px;
	}
	form {
		margin-top: 6px;
	}
	/* mid-drag the rows stand still under the cursor: no hover tint, and the
	   hand is the grab for the whole page */
	table.reordering tbody > tr:hover {
		background-color: transparent;
	}
	:global(body:has(table.reordering)),
	:global(body:has(table.reordering) *) {
		cursor: grabbing;
	}
	/* the slot the deck would drop into, a hole in the table's own ground */
	tr.placeholder-row td {
		padding: 0;
	}
	/* the lifted deck rides with the cursor, as a card does in Cards */
	.drag-ghost {
		position: fixed;
		z-index: 20;
		pointer-events: none;
		max-width: 260px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding: 3px 10px;
		background-color: white;
		border: 1px solid #ccc;
		box-shadow: rgba(0, 0, 0, 0.2) 0 2px 8px;
		font-size: 0.875rem;
		color: #333;
		opacity: 0.85;
	}
</style>

