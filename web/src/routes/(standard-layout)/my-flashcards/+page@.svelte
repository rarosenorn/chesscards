<script>
	import { SvelteSet } from "svelte/reactivity"
	import { confirmModal, settleModal } from "$lib/modals.svelte.js"
	import Heatmap from "$lib/components/Heatmap.svelte"
	import StandardLayout from "$lib/components/StandardLayout.svelte"
	import { invalidateAll } from "$app/navigation"
	import { deckSubtree } from "$lib/deck-tree.js"
	import { createDeck, renameDeck, moveDeck, flattenDeck, setInOrder } from "./decks.remote.js"
	let { data } = $props();

	// Every deck of the user's as one tree, in reading order (decks.getListing):
	// their own, the marketplace decks they have taken, and the decks inside
	// those. A row knows its level, whether it holds decks, and the counts
	// of everything under it.
	let rows = $derived(data.decks);
	let byId = $derived(new Map(rows.map(row => [row.id, row])));
	// a marketplace deck taken, and a deck inside one, which is not the
	// user's to rearrange
	const isTaken = row => row.bought && row.id === row.instance_id;
	const isInsideTaken = row => row.bought && row.id !== row.instance_id;
	const childrenOf = row => rows.filter(other => other.parent_id === row.id);

	// A deck that holds decks opens to show them, and they open the same way,
	// level by level. Which ones are open is the reader's own business, kept
	// in this browser from one visit to the next.
	const EXPANDED_KEY = "chesscards:expanded-decks";
	const storedExpanded = () => {
		try { return JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? "[]"); } catch { return []; }
	}
	let expanded = $state(new SvelteSet());
	// read after mount: the server renders every deck closed
	$effect(() => { expanded = new SvelteSet(storedExpanded()); });
	const keepExpanded = () => {
		try { localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded])); } catch {}
	}
	const toggleExpanded = id => {
		if (!expanded.delete(id)) expanded.add(id);
		keepExpanded();
	}
	const expand = id => {
		expanded.add(id);
		keepExpanded();
	}

	const REFRESH_MS = 10 * 60 * 1000;
	$effect(() => {
		const refresh = () => {
			if (document.visibilityState === "visible" && !drag?.started) invalidateAll();
		};
		const id = setInterval(refresh, REFRESH_MS);
		document.addEventListener("visibilitychange", refresh);
		return () => {
			clearInterval(id);
			document.removeEventListener("visibilitychange", refresh);
		};
	});

	// the rows that show: each level only under an open row, so a closed deck
	// keeps everything inside it out of the list
	let visible = $derived.by(() => {
		const shown = [];
		let closedAt = null;
		for (const row of rows) {
			if (closedAt !== null && row.level > closedAt) continue;
			closedAt = row.holdsDecks && !expanded.has(row.id) ? row.level : null;
			shown.push(row);
		}
		return shown;
	});

	// --- names ---
	// A deck is named at birth and when renamed through the same field in a
	// modal: a name the server refuses (taken among its siblings, too long)
	// is asked for again, with what was wrong said under the field and what
	// was typed still in it.
	let naming = $state({ value: "", error: null });
	const askName = async ({ title, value = "", confirmLabel, save }) => {
		naming.value = value;
		naming.error = null;
		while (await confirmModal({ title, body: nameField, confirmLabel })) {
			try {
				await save(naming.value);
				return;
			} catch (err) {
				naming.error = err?.body?.message ?? "That did not work. Try again.";
			}
		}
	}

	const createAtTop = () => askName({
		title: "Create deck", confirmLabel: "Create",
		save: async name => { await createDeck({ name }); await invalidateAll(); }
	});
	const createInside = row => askName({
		title: "Create deck", confirmLabel: "Create",
		save: async name => { await createDeck({ name, parentId: row.id }); expand(row.id); await invalidateAll(); }
	});
	const rename = row => askName({
		title: "Rename deck", value: row.name, confirmLabel: "Rename",
		save: async name => { await renameDeck({ id: row.id, name }); await invalidateAll(); }
	});

	// --- what goes, and what stays ---
	const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
	// the marketplace decks taken that sit under a deck, which are not its
	// to flatten away
	const takenUnder = row => rows.filter(other => isTaken(other) && other.id !== row.id && deckSubtree(rows, row.id).has(other.id));
	// the cards under a deck that are the user's own
	const ownCardsUnder = row => row.total - takenUnder(row).reduce((sum, taken) => sum + taken.total, 0);
	const ownDecksInside = row => rows.filter(other => !other.bought && other.id !== row.id && deckSubtree(rows, row.id).has(other.id)).length;

	// Flattening: the decks inside a deck are taken away and every card in
	// them becomes the deck's own, in order. The grouping cannot be put back,
	// so it is always asked about first, in words that say what goes and what
	// stays.
	const flatten = async row => {
		const inside = ownDecksInside(row);
		const ownCards = row.total - childrenOf(row).reduce((sum, child) => sum + child.total, 0);
		const moving = ownCardsUnder(row) - ownCards;
		const taken = takenUnder(row).length;
		const confirmed = await confirmModal({
			title: "Flatten deck",
			message: `This removes the ${plural(inside, "deck")} inside "${row.name}". `
				+ (moving === 0 ? "There are no cards in them." : `The ${plural(moving, "card")} in them stay${moving === 1 ? "s" : ""}, in the same order, directly in "${row.name}".`)
				+ (taken ? ` The marketplace ${taken === 1 ? "deck" : "decks"} inside stay${taken === 1 ? "s" : ""}, directly in it.` : ""),
			confirmLabel: "Flatten"
		});
		if (!confirmed) return;
		await flattenDeck({ id: row.id });
		await invalidateAll();
	}

	const chooseInOrder = async (row, inOrder) => {
		if (row.in_order === inOrder) return;
		await setInOrder({ id: row.id, inOrder });
		await invalidateAll();
	}

	// Move to: the same move as a drag, picked from the tree — for a long
	// list, and for a phone, where dragging is awkward. Anywhere of the
	// user's own but inside the deck itself.
	let moving = $state({ row: null, to: null });
	let destinations = $derived(moving.row
		? rows.filter(row => !row.bought && !deckSubtree(rows, moving.row.id).has(row.id))
		: []);
	const moveTo = async row => {
		moving = { row, to: undefined };
		if (!await confirmModal({ title: `Move ${row.name}`, body: destinationField, confirmLabel: "Move" })) return;
		if (moving.to === undefined) return;
		try {
			await moveDeck({ id: row.id, parentId: moving.to, index: null });
		} catch (err) {
			await confirmModal({ title: "Could not move the deck", message: err?.body?.message ?? "That did not work. Try again.", confirmLabel: "OK" });
			return;
		}
		if (moving.to) expand(moving.to);
		await invalidateAll();
	}

	// --- the deck's menu ---
	// The wheel at the end of a row opens it, and so does a right-click on
	// the row. What a row offers depends on whose it is: a deck of the user's
	// own all of it, a marketplace deck taken what is theirs to do with it,
	// and a deck inside one only how its own decks are taken.
	let menu = $state(null);
	const menuItems = row => {
		if (isInsideTaken(row)) return row.holdsDecks ? ["order"] : [];
		if (isTaken(row)) return ["move", ...(row.holdsDecks ? ["order"] : [])];
		// flattening takes away the user's own decks inside; marketplace decks stay
		return ["rename", "move", ...(ownDecksInside(row) ? ["flatten"] : []), "create", ...(row.holdsDecks ? ["order"] : [])];
	}
	const openMenu = (row, x, y) => {
		if (menuItems(row).length === 0) return;
		menu = { row, x, y };
	}
	const handleRowContextMenu = (e, row) => {
		if (menuItems(row).length === 0) return;
		e.preventDefault();
		openMenu(row, e.clientX, e.clientY);
	}
	const fromMenu = act => {
		const { row } = menu;
		menu = null;
		act(row);
	}

	// --- dragging ---
	// A row is dragged to another place: onto a deck of the user's own to go
	// inside it (the deck lights up), or between rows to sit there at their
	// level (a line shows where) — between the top-level rows, at the top of
	// the list. Past the last row is the end of the top. Never into itself or
	// anything inside it, and nothing goes inside a marketplace deck. A press
	// only becomes a drag once the pointer has moved, so a click still opens
	// the deck.
	let drag = $state(null);
	let justDragged = false;

	const handleRowMouseDown = (e, row) => {
		if (e.button !== 0 || isInsideTaken(row)) return;
		// no native link drag or text selection; the click still lands
		e.preventDefault();
		drag = {
			row, started: false, within: deckSubtree(rows, row.id),
			startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY,
			// { targetId, zone: "before" | "after" | "inside" | "end", parentId, index }
			drop: null
		};
	}

	// where letting go over this row would put the deck in hand
	const dropOn = (target, part) => {
		// a marketplace deck takes nothing inside: before or after it — but
		// only before it while it is open, where just under it is the first
		// of its own decks, not the place after it
		const zone = target.bought
			? (part < 0.5 || (target.holdsDecks && expanded.has(target.id)) ? "before" : "after")
			: part < 0.25 ? "before" : part > 0.75 ? "after" : "inside";
		if (zone === "inside") return { targetId: target.id, zone, parentId: target.id, index: null };
		// just under an open deck that holds decks reads as the first deck inside it
		if (zone === "after" && !target.bought && target.holdsDecks && expanded.has(target.id)) {
			return { targetId: target.id, zone, parentId: target.id, index: 0 };
		}
		const parentId = target.parent_id ?? null;
		const siblings = rows.filter(row => (row.parent_id ?? null) === parentId && row.id !== drag.row.id);
		return { targetId: target.id, zone, parentId, index: siblings.indexOf(target) + (zone === "after" ? 1 : 0) };
	}

	const handleWindowMouseMove = e => {
		if (!drag) return;
		drag.x = e.clientX;
		drag.y = e.clientY;
		if (!drag.started) {
			if (Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) <= 5) return;
			drag.started = true;
		}
		const under = document.elementFromPoint(e.clientX, e.clientY)?.closest("tr[data-row-id]");
		const target = under && byId.get(under.dataset.rowId);
		if (target) {
			if (drag.within.has(target.id) || isInsideTaken(target)) {
				drag.drop = null;
				return;
			}
			const rect = under.getBoundingClientRect();
			drag.drop = dropOn(target, (e.clientY - rect.top) / rect.height);
			return;
		}
		// past the last row, within the table's width: the end of the top
		const table = document.querySelector("table.decks");
		const last = table?.querySelector("tbody tr:last-child")?.getBoundingClientRect();
		const box = table?.getBoundingClientRect();
		drag.drop = last && box && e.clientY > last.bottom && e.clientY < last.bottom + 60
			&& e.clientX > box.left && e.clientX < box.right
			? { targetId: null, zone: "end", parentId: null, index: null }
			: null;
	}

	// A gap between two rows has one line, whichever of the two the pointer
	// is on: it is drawn along the lower row's top edge (along the last row's
	// bottom at the end, and along the upper row's bottom when the lower one
	// is in hand). It starts where a deck at the level it would land at starts.
	const zoneOf = row => drag?.started && drag.drop?.targetId === row.id ? drag.drop.zone : null;
	const landingLevel = row => drag.drop.parentId === row.id ? row.level + 1 : row.level;
	const lifted = row => drag?.started && drag.within.has(row.id);
	const dropLineAt = i => {
		const row = visible[i], above = visible[i - 1], below = visible[i + 1];
		if (zoneOf(row) === "before") return { side: "above", level: landingLevel(row) };
		if (above && zoneOf(above) === "after" && !lifted(row)) return { side: "above", level: landingLevel(above) };
		if (zoneOf(row) === "after" && (!below || lifted(below))) return { side: "below", level: landingLevel(row) };
		return null;
	}

	const handleWindowMouseUp = async () => {
		const d = drag;
		if (!d) return;
		drag = null;
		if (!d.started) return;
		// the mouseup can still turn into a click on the row it ends over
		justDragged = true;
		setTimeout(() => justDragged = false);
		if (!d.drop) return;
		try {
			await moveDeck({ id: d.row.id, parentId: d.drop.parentId, index: d.drop.index });
		} catch (err) {
			await confirmModal({ title: "Could not move the deck", message: err?.body?.message ?? "That did not work. Try again.", confirmLabel: "OK" });
			return;
		}
		if (d.drop.parentId) expand(d.drop.parentId);
		await invalidateAll();
	}
</script>

<svelte:window
	onmousemove={handleWindowMouseMove}
	onmouseup={handleWindowMouseUp}
	onmousedown={() => { menu = null }}
	onkeydown={e => { if (e.key === "Escape") { menu = null; drag = null } }}
/>

<!-- The plus that opens a row onto the decks inside it, a minus once it is
     open (as Anki has them). It is there only for a row that holds decks;
     the name keeps its place either way. -->
{#snippet expander(row)}
	<button
		class="expander"
		class:open={expanded.has(row.id)}
		class:empty={!row.holdsDecks}
		aria-label={`${expanded.has(row.id) ? "Hide" : "Show"} the decks inside`}
		aria-expanded={expanded.has(row.id)}
		tabindex={row.holdsDecks ? 0 : -1}
		onmousedown={e => e.stopPropagation()}
		onclick={() => toggleExpanded(row.id)}
	></button>
{/snippet}

<!-- anki's three columns -->
{#snippet counts(of)}
	<td class="count new" class:none={of.new == 0}>{of.new}</td>
	<td class="count learn" class:none={of.learn == 0}>{of.learn}</td>
	<td class="count review" class:none={of.review == 0}>{of.review}</td>
{/snippet}

<!-- the deck in hand, saying where letting go would put it when that is
     inside another -->
{#if drag?.started}
	<div class="drag-ghost" style="left: {drag.x + 14}px; top: {drag.y + 10}px">
		{#if drag.drop?.zone === "inside"}
			{drag.row.name} → {byId.get(drag.drop.targetId)?.name}
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
		{#each menuItems(menu.row) as item}
			{#if item === "create"}
				<button onclick={() => fromMenu(createInside)}>Create subdeck</button>
			{:else if item === "rename"}
				<button onclick={() => fromMenu(rename)}>Rename</button>
			{:else if item === "order"}
				<!-- how the decks inside are taken, the one in force ticked -->
				<span class="menu-heading">Decks inside</span>
				{#each [[true, "In order"], [false, "Mixed"]] as [inOrder, label]}
					<button class="menu-item" class:chosen={menu.row.in_order === inOrder} onclick={() => fromMenu(row => chooseInOrder(row, inOrder))}>
						{label}
					</button>
				{/each}
			{:else if item === "flatten"}
				<button onclick={() => fromMenu(flatten)}>Flatten</button>
			{:else if item === "move"}
				<button onclick={() => fromMenu(moveTo)}>Move to</button>
			{/if}
		{/each}
	</div>
{/if}

<!-- the name asked for in the modal that makes or renames a deck; Enter in
     the field confirms -->
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

<!-- where Move to can put the deck: the top of the list, or inside any deck
     of the user's own but itself and what is inside it, as the tree reads -->
{#snippet destinationField()}
	<div class="destinations" role="radiogroup">
		<button class="destination" class:chosen={moving.to === null} role="radio" aria-checked={moving.to === null} onclick={() => moving.to = null}>
			Top of the list
		</button>
		{#each destinations as row (row.id)}
			<button
				class="destination"
				class:chosen={moving.to === row.id}
				role="radio"
				aria-checked={moving.to === row.id}
				style:padding-left="{10 + (row.level + 1) * 16}px"
				onclick={() => moving.to = row.id}
			>
				{row.name}
			</button>
		{/each}
	</div>
{/snippet}

<StandardLayout>
	<!-- what the page can make, at the right of its title row -->
	{#snippet headerActions()}
		<div class="create-row">
			<button class="std-btn" onclick={createAtTop}>Create deck</button>
		</div>
	{/snippet}
	<table class="decks" class:dragging={drag?.started} class:drop-end={drag?.drop?.zone === "end"}>
		<thead>
			<tr>
				<th>Deck</th>
				<th>New</th>
				<th>Learn</th>
				<th>Due</th>
				<th class="wheel-col"></th>
			</tr>
		</thead>
		<tbody>
			{#each visible as row, i (row.id)}
				{@const line = dropLineAt(i)}
				<tr
					data-row-id={row.id}
					class:drop-inside={zoneOf(row) === "inside"}
					class:drop-line-above={line?.side === "above"}
					class:drop-line-below={line?.side === "below"}
					style:--drop-indent={line ? `${4 + line.level * 26}px` : undefined}
					class:lifted={lifted(row)}
					onmousedown={e => handleRowMouseDown(e, row)}
					oncontextmenu={e => handleRowContextMenu(e, row)}
				>
					<td style:padding-left={row.level ? `${4 + row.level * 26}px` : undefined}>
						{@render expander(row)}
						<a
							href="my-flashcards/{row.id}/study"
							draggable="false"
							onclick={e => { if (justDragged) e.preventDefault() }}
						>
							{row.name}
						</a>
					</td>
					{@render counts(row)}
					<td class="wheel-cell">
						{#if menuItems(row).length}
							<button
								class="wheel"
								aria-label="Deck options"
								aria-haspopup="menu"
								onmousedown={e => e.stopPropagation()}
								onclick={e => {
									const box = e.currentTarget.getBoundingClientRect();
									openMenu(row, box.left, box.bottom + 2);
								}}
							>
								<svg viewBox="0 0 24 24" aria-hidden="true">
									<path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M14.28 2.15C13.91 2 13.44 2 12.5 2s-1.41 0-1.78.15a2 2 0 0 0-1.09 1.08c-.09.23-.13.49-.14.87a1.6 1.6 0 0 1-.8 1.35 1.6 1.6 0 0 1-1.58.01c-.34-.18-.58-.28-.82-.31a2 2 0 0 0-1.5.4c-.31.24-.55.65-1.02 1.45s-.7 1.21-.76 1.6a2 2 0 0 0 .4 1.48c.15.2.36.36.68.56.48.3.78.8.78 1.36s-.3 1.06-.78 1.36c-.32.2-.53.36-.68.56a2 2 0 0 0-.4 1.48c.06.4.29.8.76 1.6s.7 1.21 1.02 1.45a2 2 0 0 0 1.5.4c.24-.03.48-.13.82-.31a1.6 1.6 0 0 1 1.58.01c.49.28.78.8.8 1.35.01.38.05.64.14.87.2.49.6.88 1.09 1.08.37.15.84.15 1.78.15s1.41 0 1.78-.15a2 2 0 0 0 1.09-1.08c.09-.23.13-.49.14-.87.02-.56.31-1.07.8-1.35a1.6 1.6 0 0 1 1.58-.01c.34.18.58.28.82.31a2 2 0 0 0 1.5-.4c.31-.24.55-.65 1.02-1.45s.7-1.21.76-1.6a2 2 0 0 0-.4-1.48c-.15-.2-.36-.36-.68-.56a1.6 1.6 0 0 1-.78-1.36c0-.56.3-1.06.78-1.36.32-.2.53-.36.68-.56a2 2 0 0 0 .4-1.48c-.06-.4-.29-.8-.76-1.6s-.7-1.21-1.02-1.45a2 2 0 0 0-1.5-.4c-.24.03-.48.13-.82.31a1.6 1.6 0 0 1-1.58-.01 1.6 1.6 0 0 1-.8-1.35c-.01-.38-.05-.64-.14-.87a2 2 0 0 0-1.09-1.08ZM12.5 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>
								</svg>
							</button>
						{/if}
					</td>
				</tr>
			{:else}
				<tr class="empty-row">
					<td colspan="5">No decks yet. Create one, or take one from the marketplace.</td>
				</tr>
			{/each}
		</tbody>
	</table>

	<!-- the year's study, a square a day, under everything there is to study -->
	<div class="activity">
		<Heatmap days={data.activity.days} forecast={data.activity.forecast} today={data.activity.today} />
	</div>
</StandardLayout>

<style>
	/* fixed column widths, so the counts line up down the tree */
	table {
		padding: 8px;
		border-collapse: collapse;
		margin-top: 12px;
		margin-bottom: 12px;
		table-layout: fixed;
		width: 100%;
	}
	/* the list stands 24px under the page's heading: the page's own padding
	   is 25px */
	table:first-of-type {
		margin-top: -1px;
	}
	th:nth-child(n + 2) {
		width: 65px;
	}
	/* the wheel's column, no wider than the wheel */
	th.wheel-col {
		width: 32px;
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
	/* The wheel that opens a deck's menu: grey, always there (a phone has no
	   hover to find it by), above the row-filling link so it takes its own
	   click. */
	.wheel {
		position: relative;
		z-index: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		border: none;
		border-radius: 4px;
		background: none;
		color: rgba(0, 0, 0, 0.35);
		cursor: pointer;
	}
	.wheel svg {
		width: 15px;
		height: 15px;
	}
	.wheel:hover {
		color: black;
		background-color: rgba(0, 0, 0, 0.06);
	}
	.empty-row td {
		padding: 8px 4px;
		color: rgba(0, 0, 0, 0.5);
		cursor: default;
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
	/* the Create button, at the right of the page's title row: the app's
	   standard button, a size down */
	.create-row {
		display: flex;
		gap: 8px;
	}
	.create-row button {
		padding: 5px 14px;
		font-size: 0.95rem;
		cursor: pointer;
	}
	/* the heatmap keeps its distance from the last list though the lists
	   have drawn closer to each other */
	.activity {
		margin-top: 24px;
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
	/* the name in the row under the pointer is underlined, with the row's
	   tint; not while a row is being carried */
	tbody > tr:hover a {
		text-decoration: underline;
	}
	table.dragging tbody > tr:hover a {
		text-decoration: none;
	}
	:global(body:has(table.dragging)),
	:global(body:has(table.dragging) *) {
		cursor: grabbing;
	}
	/* where the deck in hand would land: the deck it would go inside, lit,
	   or a line above or below the row it would sit beside — under the last
	   row for the end of the list */
	table.dragging tbody > tr.drop-inside,
	table.dragging tbody > tr.drop-inside:hover {
		background-color: var(--accent-subtle-strong);
	}
	table.dragging tbody > tr.drop-line-above td,
	table.dragging tbody > tr.drop-line-below td,
	table.drop-end tbody > tr:last-child td {
		background-image: linear-gradient(var(--accent), var(--accent));
		background-repeat: no-repeat;
		background-size: 100% 2px;
		background-position: 0 0;
	}
	table.dragging tbody > tr.drop-line-below td,
	table.drop-end tbody > tr:last-child td {
		background-position: 0 100%;
	}
	table.dragging tbody > tr.drop-line-above td:first-child {
		background-position: var(--drop-indent) 0;
	}
	table.dragging tbody > tr.drop-line-below td:first-child {
		background-position: var(--drop-indent) 100%;
	}
	table.drop-end tbody > tr:last-child td:first-child {
		background-position: 4px 100%;
	}
	/* the deck in hand, and everything inside it, steps back where it stood */
	tbody tr.lifted td {
		opacity: 0.45;
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
	/* the choices under the words that say what for, the one in force ticked */
	.context-menu button.menu-item {
		position: relative;
		padding-left: 26px;
		color: #404040;
	}
	.context-menu button.menu-item.chosen::before {
		content: "✓";
		position: absolute;
		left: 10px;
	}
	/* Move to's choices: the tree as it reads, the one chosen lit */
	.destinations {
		display: flex;
		flex-direction: column;
	}
	.destination {
		padding: 5px 10px;
		border: none;
		border-radius: 4px;
		background: none;
		text-align: left;
		font: inherit;
		color: #404040;
		cursor: pointer;
	}
	.destination:hover {
		background-color: #f0f0f0;
	}
	.destination.chosen {
		background-color: var(--accent-subtle-strong);
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

