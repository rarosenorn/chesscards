<script>
	import { deserialize } from "$app/forms"
	import { flip } from "svelte/animate"
	import { SvelteSet } from "svelte/reactivity"
	import { confirmModal, settleModal } from "$lib/modals.svelte.js"
	import Heatmap from "$lib/components/Heatmap.svelte"
	import { invalidateAll } from "$app/navigation"
	import { resolveDecks, holders } from "$lib/metadecks.js"
	import { reorderDecks, reorderMetadecks, addToMetadeck, removeFromMetadeck } from "./decks.remote.js"
	let { data } = $props();

	// the three lists as shown: a drop reorders them here at once, and a
	// fresh load (a deck created) replaces them
	// svelte-ignore state_referenced_locally -- seeded here, kept in step below
	let lists = $state({ meta: data.metadecks, market: data.marketplaceDecks, mine: data.decks });
	$effect(() => { lists = { meta: data.metadecks, market: data.marketplaceDecks, mine: data.decks } });

	// The Create button under a list asks for a name and makes a deck (or a
	// metadeck) of it. A name the server refuses is asked for again, with
	// what was wrong said under the field and what was typed still in it.
	let naming = $state({ value: "", error: null });
	const createNew = async list => {
		const isMeta = list === "meta";
		naming.value = "";
		naming.error = null;
		while (await confirmModal({ title: isMeta ? "New metadeck" : "New deck", body: nameField, confirmLabel: "Create" })) {
			const body = new FormData();
			body.set("name", naming.value);
			const response = await fetch(isMeta ? "?/createMetadeck" : "?/create", {
				method: "POST", body, headers: { "x-sveltekit-action": "true" }
			});
			const result = deserialize(await response.text());
			if (result.type === "success") return invalidateAll();
			naming.error = (result.type === "failure" && result.data?.errors?.[0]) || "That did not work. Try again.";
		}
	}

	// A row is dragged to reorder its own list, or onto a metadeck to go
	// inside it; a row inside a metadeck is dragged out of it to leave it, or
	// onto another metadeck to move there. A press only becomes a drag once
	// the pointer has moved, so a click still opens the deck. While a row of
	// a list is carried it is lifted out, and a placeholder holds the slot it
	// would drop into.
	let drag = $state(null);
	let justDragged = false;

	// The metadecks a deck, a marketplace deck or a metadeck can still go
	// into: not one that holds it already, and for a metadeck never itself
	// or one it holds, which would close a loop.
	const canHold = (metadeck, kind, ref) =>
		!metadeck.items.some(item => item.id === ref)
		&& !(kind === "metadeck" && holders(data.metadecks, metadeck.id).has(ref));

	const addTo = async (metadeck, row, from = null) => {
		await addToMetadeck({ metadeckId: metadeck.id, kind: row.kind, id: row.ref, fromMetadeckId: from?.id });
		await invalidateAll();
	}
	const removeFrom = async (metadeck, row) => {
		await removeFromMetadeck({ metadeckId: metadeck.id, kind: row.kind, id: row.ref });
		await invalidateAll();
	}

	const handleRowMouseDown = (e, row) => {
		if (e.button !== 0) return;
		// no native link drag or text selection; the click still lands
		e.preventDefault();
		const index = row.list ? lists[row.list].indexOf(row.item) : -1;
		drag = {
			row, list: row.list ?? null, deck: row.item, started: false,
			startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY,
			rowHeight: e.currentTarget.getBoundingClientRect().height,
			from: index, over: index,
			// the metadeck it would go into and the row of it under the pointer
			target: null, targetRowId: null,
			// a row inside a metadeck, carried clear of it: let go, it leaves
			out: false
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

		// The metadeck under the pointer, when the row can go into it. Among
		// the metadecks themselves a drag also reorders, so there only the
		// middle of a row means inside (as a subdeck is dropped in Cards).
		const under = document.elementFromPoint(e.clientX, e.clientY)?.closest("tr[data-row-id]");
		const metadeck = under?.dataset.metadeck && lists.meta.find(candidate => candidate.id === under.dataset.metadeck);
		let target = metadeck && canHold(metadeck, drag.row.kind, drag.row.ref) ? metadeck : null;
		if (target && drag.list === "meta") {
			const rect = under.getBoundingClientRect();
			const part = (e.clientY - rect.top) / rect.height;
			if (part < 0.25 || part > 0.75) target = null;
		}
		drag.target = target;
		drag.targetRowId = target ? under.dataset.rowId : null;
		// The slot stays where it was while a metadeck is aimed at: moving it
		// would shift the rows under the pointer and the aim with them.
		if (target) return;

		if (!drag.list) {
			// clear of its metadeck: not over that metadeck's row or anything under it
			const home = drag.row.parentRowId;
			const at = under?.dataset.rowId;
			drag.out = !(at && (at === home || at.startsWith(home + "/")));
			return;
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
		if (d.target) return addTo(d.target, d.row, d.row.parent);
		if (!d.list) {
			if (d.out) await removeFrom(d.row.parent, d.row);
			return;
		}
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

	// The same two acts without a drag, from a right-click on the row: the
	// metadecks it can go into, and for a row inside one the way out of it.
	// A row with neither to offer keeps the browser's own menu.
	let menu = $state(null);
	const handleRowContextMenu = (e, row) => {
		if (!row.kind) return;
		const targets = lists.meta.filter(metadeck => canHold(metadeck, row.kind, row.ref));
		if (!targets.length && !row.parent) return;
		e.preventDefault();
		menu = { x: e.clientX, y: e.clientY, row, targets };
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

	// `kind` and `ref` say what a row is of (a subdeck's row has neither);
	// `parent` and `parentRowId` are the metadeck a row stands inside and
	// that metadeck's row.
	let instanceIds = $derived(new Set(data.marketplaceDecks.map(deck => deck.id)));
	const deckRow = (deck, id, depth, parent = null, parentRowId = null) => ({
		id, depth, name: deck.name, href: `my-flashcards/${deck.id}/study`,
		counts: deck, opens: deck.subdecks.length > 0, holds: "subdecks",
		kind: instanceIds.has(deck.id) ? "instance" : "deck", ref: deck.id, parent, parentRowId,
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

	const metadeckRow = (metadeck, id, depth, parent = null, parentRowId = null) => ({
		id, depth, name: metadeck.name, href: `my-flashcards/metadecks/${metadeck.id}/study`,
		counts: totals(metadeck), opens: metadeck.items.length > 0, holds: "decks",
		kind: "metadeck", ref: metadeck.id, metadeck, parent, parentRowId,
		inside: () => metadeck.items.flatMap(item => {
			const held = item.kind === "metadeck" ? metadecksById.get(item.id) : decksById.get(item.id);
			if (!held) return [];
			return opened((item.kind === "metadeck" ? metadeckRow : deckRow)(held, `${id}/${item.id}`, depth + 1, metadeck, id));
		})
	});

	// a row, and under it what it holds when it is open
	const opened = row => [row, ...(expanded.has(row.id) ? row.inside() : [])];

	// a row of a list itself: the one that is dragged to reorder it
	const listRow = (list, item) => ({ ...(list === "meta" ? metadeckRow : deckRow)(item, item.id, 0), item, list });

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

<svelte:window
	onmousemove={handleWindowMouseMove}
	onmouseup={handleWindowMouseUp}
	onmousedown={() => { menu = null }}
	onkeydown={e => { if (e.key === "Escape") menu = null }}
/>

<!-- The plus that opens a row onto what is inside it, a minus once it is
     open (as Anki has them). It is there only for a row that holds
     something; the name keeps its place either way. -->
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
	<table data-list={list} class:creatable={list !== "market"} class:dragging={drag?.started}>
		<thead>
			<tr>
				<th>
					{firstTableHeader}
					<!-- what a metadeck is and how one is filled, for whoever meets
					     the word here first (the app's own tooltip) -->
					{#if list === "meta"}
						<span
							class="info"
							data-tip="A metadeck groups decks so you can study them together. Drag a deck onto one, or right-click a deck and choose Add to metadeck. The decks stay in their own lists; drag one out of a metadeck to take it out."
						>i</span>
					{/if}
				</th>
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
					data-row-id={row.placeholder ? undefined : row.id}
					data-metadeck={row.metadeck?.id}
					class:placeholder-row={row.placeholder}
					class:drop-inside={drag?.started && drag.targetRowId === row.id}
					class:lifted={drag?.started && drag.row.id === row.id}
					style:height={row.placeholder ? `${drag.rowHeight}px` : undefined}
					animate:flip={{ duration: drag?.started && drag.list === list ? 150 : 0 }}
					onmousedown={row.item || row.parent ? e => handleRowMouseDown(e, row) : undefined}
					oncontextmenu={row.placeholder ? undefined : e => handleRowContextMenu(e, row)}
				>
					{#if row.placeholder}
						<td colspan="4"></td>
					{:else}
						<td style:padding-left={row.depth ? `${4 + row.depth * 26}px` : undefined}>
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

<!-- the row in hand, saying what letting go would do when that is more
     than putting it down -->
{#if drag?.started}
	<div class="drag-ghost" style="left: {drag.x + 14}px; top: {drag.y + 10}px">
		{#if drag.target}
			{drag.row.name} → {drag.target.name}
		{:else if drag.out}
			Remove {drag.row.name} from {drag.row.parent.name}
		{:else}
			{drag.row.name}
		{/if}
	</div>
{/if}

{#if menu}
	<div
		class="context-menu"
		role="menu"
		tabindex="-1"
		style="left: {menu.x}px; top: {menu.y}px"
		onmousedown={e => e.stopPropagation()}
	>
		{#if menu.targets.length}
			<span class="menu-heading">Add to metadeck</span>
			{#each menu.targets as metadeck (metadeck.id)}
				<button
					class="menu-item"
					onclick={() => {
						const { row } = menu;
						menu = null;
						addTo(metadeck, row);
					}}
				>
					{metadeck.name}
				</button>
			{/each}
		{/if}
		{#if menu.row.parent}
			<button
				onclick={() => {
					const { row } = menu;
					menu = null;
					removeFrom(row.parent, row);
				}}
			>
				Remove from {menu.row.parent.name}
			</button>
		{/if}
	</div>
{/if}

<!-- the name asked for in the modal that makes a deck or a metadeck; Enter
     in the field creates -->
{#snippet nameField()}
	<div class="name-prompt">
		<!-- svelte-ignore a11y_autofocus -- the modal is there to ask for this -->
		<input
			bind:value={naming.value}
			autofocus
			maxlength="100"
			autocomplete="off"
			placeholder="Name"
			onkeydown={e => {
				if (e.key !== "Enter") return;
				e.preventDefault();
				settleModal(true);
			}}
		/>
		{#if naming.error}
			<p class="name-error">{naming.error}</p>
		{/if}
	</div>
{/snippet}

<!-- under a list, the button that adds to it: it asks for the name -->
{#snippet createButton(list)}
	<div class="create">
		<button class="std-btn" aria-label={list === "meta" ? "Create metadeck" : "Create deck"} onclick={() => createNew(list)}>Create</button>
	</div>
{/snippet}

{@render deckTable("Marketplace decks", "market")}
{@render deckTable("My decks", "mine")}
{@render createButton("mine")}
{@render deckTable("Metadecks", "meta")}
{@render createButton("meta")}

<!-- the year's study, a square a day, under everything there is to study -->
<div class="activity">
	<Heatmap days={data.activity.days} forecast={data.activity.forecast} today={data.activity.today} />
</div>

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
	/* the small "i" beside a section's title that explains it on hover */
	.info {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 14px;
		height: 14px;
		margin-left: 4px;
		border: 1px solid rgba(0, 0, 0, 0.45);
		border-radius: 50%;
		font-family: Georgia, serif;
		font-size: 10px;
		font-weight: 400;
		font-style: italic;
		line-height: 1;
		color: rgba(0, 0, 0, 0.6);
		vertical-align: 2px;
		cursor: help;
	}
	/* The plus that opens a row onto what is inside it, and the minus that
	   closes it: above the row-filling link, so it takes its own click. A row
	   that holds nothing keeps the sign's room, unseen, so the names of a
	   level line up. */
	.expander {
		position: relative;
		z-index: 1;
		width: 16px;
		height: 16px;
		padding: 0;
		border: none;
		background: none;
		cursor: pointer;
		vertical-align: baseline;
		font: inherit;
		line-height: 16px;
		color: #404040;
	}
	.expander::before {
		content: "+";
	}
	/* the sign answers to more than its own strokes: the whole height of the
	   row and some room either side, so a press meant for it does not land
	   on the name and open the deck */
	.expander::after {
		content: "";
		position: absolute;
		inset: -8px -5px -8px -9px;
	}
	.expander.open::before {
		content: "\2212";
	}
	.expander:hover {
		color: black;
	}
	.expander.empty {
		visibility: hidden;
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
	/* The create button belongs to the list it adds to, so it sits closer to
	   it than the lists sit to each other, and keeps their distance from
	   what comes next. */
	table.creatable {
		margin-bottom: 8px;
	}
	.create {
		margin: 6px 0 32px;
	}
	/* the app's standard button, at the size of a note under a list */
	.create button {
		padding: 5px 14px;
		font-size: 0.95rem;
		cursor: pointer;
	}
	.activity {
		margin-top: 12px;
	}
	/* the name field in the modal that follows */
	.name-prompt {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.name-prompt input {
		border: 1px solid rgba(0, 0, 0, 0.25);
		border-radius: 6px;
		padding: 8px 10px;
		font-size: 1rem;
	}
	.name-prompt input:focus {
		outline: 2px solid var(--accent);
		outline-offset: -1px;
	}
	.name-error {
		margin: 0;
		font-size: 0.9rem;
		color: #c62828;
	}
	/* mid-drag the rows stand still under the cursor: no hover tint, and the
	   hand is the grab for the whole page */
	table.dragging tbody > tr:hover {
		background-color: transparent;
	}
	:global(body:has(table.dragging)),
	:global(body:has(table.dragging) *) {
		cursor: grabbing;
	}
	/* the metadeck the row in hand would go into */
	table.dragging tbody > tr.drop-inside,
	table.dragging tbody > tr.drop-inside:hover {
		background-color: var(--accent-subtle-strong);
	}
	/* a row carried out of its metadeck steps back where it stood */
	tbody tr.lifted td {
		opacity: 0.45;
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
		max-width: 420px;
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
	/* the right-click menu, as in Cards */
	.context-menu {
		position: fixed;
		z-index: 10;
		background-color: white;
		border: 1px solid #ccc;
		border-radius: 4px;
		box-shadow: rgba(0, 0, 0, 0.15) 0 2px 8px;
		padding: 4px;
	}
	.context-menu button {
		display: block;
		width: 100%;
		text-align: left;
		padding: 4px 12px;
		border: none;
		background: none;
		cursor: pointer;
	}
	.context-menu button:hover {
		background-color: #f0f0f0;
	}
	/* the metadecks to choose among, under the words that say what for */
	.context-menu button.menu-item {
		padding-left: 26px;
		color: #404040;
	}
	.menu-heading {
		display: block;
		padding: 4px 12px 2px;
		font-size: 0.75rem;
		font-weight: 600;
		color: rgba(0, 0, 0, 0.5);
		cursor: default;
	}
</style>

