<script>
	import { enhance } from "$app/forms"
	import { flip } from "svelte/animate"
	import { SvelteSet } from "svelte/reactivity"
	import FormErrors from "$lib/components/FormErrors.svelte"
	import { invalidateAll } from "$app/navigation"
	import { resolveDecks } from "$lib/metadecks.js"
	import { reorderDecks, reorderMetadecks } from "./decks.remote.js"
	let { data, form } = $props();

	// the three lists as shown: a drop reorders them here at once, and a
	// fresh load (a deck created) replaces them
	// svelte-ignore state_referenced_locally -- seeded here, kept in step below
	let lists = $state({ meta: data.metadecks, market: data.marketplaceDecks, mine: data.decks });
	$effect(() => { lists = { meta: data.metadecks, market: data.marketplaceDecks, mine: data.decks } });

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
		const ids = lists[d.list].map(deck => deck.id);
		try {
			await (d.list === "meta" ? reorderMetadecks({ ids }) : reorderDecks({ marketplace: d.list === "market", ids }));
		} catch (err) {
			lists[d.list] = before;
			throw err;
		}
		// what a metadeck holds stands in the order of these lists
		if (lists.meta.length) await invalidateAll();
	}

	// A deck that uses subdecks opens to show them, each with its own counts,
	// and a subdeck that holds subdecks opens the same way, level by level; a
	// metadeck opens onto the decks and metadecks it holds, which open in
	// turn. Which ones are open is the reader's own business, kept in this
	// browser from one visit to the next (by the row's id: its own for a row
	// of a list, and for a row under another that row's and its own together).
	const EXPANDED_KEY = "chesscards:expanded-decks";
	const storedExpanded = () => {
		try { return JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? "[]"); } catch { return []; }
	}
	let expanded = $state(new SvelteSet());
	// read after mount: the server renders every deck closed
	$effect(() => { expanded = new SvelteSet(storedExpanded()); });
	const toggleExpanded = id => {
		if (!expanded.delete(id)) expanded.add(id);
		try { localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded])); } catch {}
	}

	// A row of a table: its name, where a click on it studies, its three
	// numbers, how far in it stands, and whether it opens (`holds` names what
	// onto, `inside` gives those rows).

	// the subdecks of an open deck that show: each level only under an open
	// row, so a closed subdeck keeps everything inside it out of the list
	const subdeckRows = (deck, deckRowId, depth) => {
		const rows = [];
		// the level of the closed subdeck the walk is inside, if any
		let closedAt = null;
		for (const subdeck of deck.subdecks) {
			if (closedAt !== null && subdeck.level > closedAt) continue;
			const id = `${deckRowId}:${subdeck.id}`;
			closedAt = subdeck.holdsSubdecks && !expanded.has(id) ? subdeck.level : null;
			// a subdeck is studied on its own from here, locked or not; its
			// numbers are what that would bring
			rows.push({
				id, depth: depth + subdeck.level, name: subdeck.name,
				href: `my-flashcards/${deck.id}/study?subdeck=${subdeck.id}`,
				counts: subdeck, opens: subdeck.holdsSubdecks, holds: "subdecks", locked: subdeck.locked
			});
		}
		return rows;
	}

	const deckRow = (deck, id, depth) => ({
		id, depth, name: deck.name, href: `my-flashcards/${deck.id}/study`,
		counts: deck, opens: deck.subdecks.length > 0, holds: "subdecks",
		inside: () => subdeckRows(deck, id, depth)
	});

	let decksById = $derived(new Map([...data.marketplaceDecks, ...data.decks].map(deck => [deck.id, deck])));
	let metadecksById = $derived(new Map(data.metadecks.map(metadeck => [metadeck.id, metadeck])));

	// a metadeck's numbers: those of the decks it comes to, each counted once
	// however many ways lead to it
	const totals = metadeck => {
		const sum = { new: 0, learn: 0, review: 0 };
		for (const { id } of resolveDecks(data.metadecks, metadeck.id)) {
			const deck = decksById.get(id);
			if (!deck) continue;
			sum.new += Number(deck.new);
			sum.learn += Number(deck.learn);
			sum.review += Number(deck.review);
		}
		return sum;
	}

	const metadeckRow = (metadeck, id, depth) => ({
		id, depth, name: metadeck.name, href: `my-flashcards/metadecks/${metadeck.id}/study`,
		counts: totals(metadeck), opens: metadeck.items.length > 0, holds: "decks",
		inside: () => metadeck.items.flatMap(item => {
			const held = item.kind === "metadeck" ? metadecksById.get(item.id) : decksById.get(item.id);
			if (!held) return [];
			return opened((item.kind === "metadeck" ? metadeckRow : deckRow)(held, `${id}/${item.id}`, depth + 1));
		})
	});

	// a row, and under it what it holds when it is open
	const opened = row => [row, ...(expanded.has(row.id) ? row.inside() : [])];

	// a row of a list itself: the one that is dragged to reorder it
	const listRow = (list, item) => ({ ...(list === "meta" ? metadeckRow : deckRow)(item, item.id, 0), item });

	// What a table shows, row by row: each of its list, with what it holds
	// under it when it is open. While one is lifted, the others with a
	// placeholder at the slot it would drop into — and nothing under them,
	// which would be rows that are not the lifted kind standing between the
	// slots.
	const rowsOf = list => {
		if (drag?.list === list && drag.started) {
			const rest = lists[list].filter(item => item !== drag.deck).map(item => listRow(list, item));
			return [...rest.slice(0, drag.over), { id: "__placeholder__", placeholder: true }, ...rest.slice(drag.over)];
		}
		return lists[list].flatMap(item => opened(listRow(list, item)));
	}
</script>

<svelte:window onmousemove={handleWindowMouseMove} onmouseup={handleWindowMouseUp} />

<!-- The arrow that opens a row onto what is inside it. It is there only for
     a row that holds something; the name keeps its place either way. -->
{#snippet expander(row)}
	{@const id = row.id}
	<button
		class="expander"
		class:open={expanded.has(id)}
		class:empty={!row.opens}
		aria-label={`${expanded.has(id) ? "Hide" : "Show"} ${row.holds}`}
		aria-expanded={expanded.has(id)}
		tabindex={row.opens ? 0 : -1}
		onmousedown={e => e.stopPropagation()}
		onclick={() => toggleExpanded(id)}
	></button>
{/snippet}

<!-- anki's three columns, for a deck or a subdeck -->
{#snippet counts(of)}
	<td class="count new" class:none={of.new == 0}>{of.new}</td>
	<td class="count learn" class:none={of.learn == 0}>{of.learn}</td>
	<td class="count review" class:none={of.review == 0}>{of.review}</td>
{/snippet}

{#snippet deckTable(firstTableHeader, list)}
	<table data-list={list} class:creatable={list !== "market"} class:reordering={drag?.started && drag.list === list}>
		<thead>
			<tr>
				<th>{firstTableHeader}</th>
				<th>New</th>
				<th>Learn</th>
				<th>Due</th>
			</tr>
		</thead>
		<tbody>
			{#each rowsOf(list) as row (row.id)}
				<!-- one tr for every kind of row and the placeholder alike: the
				     animate directive must sit directly under the keyed each -->
				<tr
					data-deck-row={row.item ? row.id : undefined}
					class:placeholder-row={row.placeholder}
					class:inner-row={row.depth > 0}
					style:height={row.placeholder ? `${drag.rowHeight}px` : undefined}
					animate:flip={{ duration: drag?.started ? 150 : 0 }}
					onmousedown={row.item ? e => handleRowMouseDown(e, list, row.item) : undefined}
				>
					{#if row.placeholder}
						<td colspan="4"></td>
					{:else}
						<td style:padding-left={row.depth ? `${4 + row.depth * 16}px` : undefined}>
							{@render expander(row)}
							<a
								href={row.href}
								draggable="false"
								onclick={e => { if (justDragged) e.preventDefault() }}
							>
								{row.name}
							</a>
							{#if row.locked}
								<svg class="lock" viewBox="0 0 16 16" aria-label="Locked" role="img">
									<rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/>
									<path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/>
								</svg>
							{/if}
						</td>
						{@render counts(row.counts)}
					{/if}
				</tr>
			{/each}
		</tbody>
	</table>
{/snippet}

{#if drag?.started}
	<div class="drag-ghost" style="left: {drag.x + 14}px; top: {drag.y + 10}px">{drag.deck.name}</div>
{/if}

<!-- the field under a list that adds to it; `metadeck` says which of the two
     a failed create came from, so its errors and its name go back there -->
{#snippet createForm(action, metadeck)}
	{@const mine = !!form?.metadeck === metadeck}
	{#if mine}<FormErrors form={form} />{/if}
	<form method="POST" action={action} use:enhance>
		<input
			name="name"
			value={mine ? form?.name ?? "" : ""}
			required
			minlength="4"
			maxlength="100"
			autocomplete="off"
		/>
		<button>Create</button>
	</form>
{/snippet}

{@render deckTable("Marketplace decks", "market")}
{@render deckTable("My decks", "mine")}
{@render createForm("?/create", false)}
{@render deckTable("Metadecks", "meta")}
{@render createForm("?/createMetadeck", true)}

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
	/* The arrow that opens a row onto what is inside it: above the
	   row-filling link, so it takes its own click. A row that holds nothing
	   keeps the arrow's room, unseen, so the names of a level line up. */
	.expander {
		position: relative;
		z-index: 1;
		width: 16px;
		height: 16px;
		padding: 0;
		border: none;
		background: none;
		cursor: pointer;
		vertical-align: middle;
	}
	.expander::before {
		content: "";
		display: block;
		width: 9px;
		height: 9px;
		margin: auto;
		background-color: rgba(0, 0, 0, 0.5);
		clip-path: polygon(17% 0, 83% 50%, 17% 100%);
	}
	.expander.open::before {
		transform: rotate(90deg);
	}
	.expander:hover::before {
		background-color: black;
	}
	.expander.empty {
		visibility: hidden;
	}
	/* a row under another: lighter than the rows of the list itself */
	tr.inner-row a {
		font-weight: 400;
	}
	tr.inner-row .count {
		font-weight: 400;
	}
	.lock {
		display: inline-block;
		width: 12px;
		height: 12px;
		margin-left: 4px;
		vertical-align: -1px;
		color: rgba(0, 0, 0, 0.45);
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
	/* an empty count recedes: nothing there to study */
	.count.none {
		color: rgba(0, 0, 0, 0.35);
		font-weight: 400;
	}
	/* section titles, larger than the deck rows they head */
	th:first-child {
		font-size: 1.05rem;
	}
	/* a create field belongs to the list it adds to, so it sits closer to it
	   than the tables sit to each other, and keeps their distance from the
	   next one */
	table.creatable {
		margin-bottom: 14px;
	}
	form {
		margin-top: 6px;
		margin-bottom: 32px;
	}
	form:last-of-type {
		margin-bottom: 0;
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

