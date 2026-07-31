<script>
	// TODO paneforge for reziing with slit
	// TODO align paragraph depending on lines
	// if single line: center 
	// if multiple line: left align
	// if more than 1 text editor and differing multi and single line: ?
	// TODO menu table arrow shortcut navigation with enter
	// TODO responsive ideas: medium deck table stacked on card table
	// small (phone) only deck and card table stacked, selected card in popover

	import { getContext, untrack } from "svelte"
	import { SvelteSet } from "svelte/reactivity"
	import { page } from "$app/state"
	import FlashcardBrowse from "$lib/components/FlashcardBrowse.svelte"
	import CardBlockEdit from "$lib/components/CardBlockEdit.svelte"
	import { ttGenerateText } from "$lib/tiptap-utility.js"
	import { confirmModal } from "$lib/modals.svelte.js"
	import { updateCardContent, updateCardType, deleteCards } from "./browse.remote.js"

	let deck = getContext("deck");
	// marketplace deck instances can only be viewed, not edited
	const readonly = deck.isMarketplace;

	// in-progress edit lives in the deck layout's context so it survives tab
	// navigation within the deck: session is CardBlockEdit's persistence bag
	const cardDrafts = getContext("cardDrafts");
	if (!cardDrafts.browse) {
		cardDrafts.browse = {
			// id of the card open for editing; selecting another card falls back to view mode
			editingCardId: null,
			// id of the card being previewed, so the tab reopens where it was left
			selectedCardId: null,
			session: null,
			// the sorted column and its direction, so the tab reopens sorted too
			sortColumn: "order",
			sortDescending: false
		};
	}
	const draft = cardDrafts.browse;
	// a draft written before sorting existed carries neither field
	draft.sortColumn ??= "order";
	draft.sortDescending ??= false;

	// returning to the tab reselects where it was left — the card being
	// edited, or failing that the one being previewed. Captured non-reactively
	// so Save/Cancel (clearing editingCardId) can't yank the selection back to
	// the first card, and mirrored below so the next visit finds it.
	// svelte-ignore state_referenced_locally
	const restoredCardId = draft.editingCardId ?? draft.selectedCardId;
	let selectedCard = $derived(
		deck.cards.find(card => card.id === restoredCardId) ?? deck.cards[0]
	);
	$effect(() => { draft.selectedCardId = selectedCard?.id ?? null; });

	let isEditingSelected = $derived(selectedCard && draft.editingCardId === selectedCard.id);

	const startEditing = () => {
		draft.session = {
			boardUi: { editingIds: new Set(), editorStates: {}, applyEditors: {}, invalidBoards: {} },
			frontDoc: null,
			backDoc: null
		};
		draft.editingCardId = selectedCard.id;
	}

	const stopEditing = () => {
		draft.editingCardId = null;
		draft.session = null;
	}

	const saveCard = async (front, back) => {
		await updateCardContent({ cardId: selectedCard.id, front, back });
		selectedCard.front = JSON.parse(front);
		selectedCard.back = JSON.parse(back);
		stopEditing();
	}

	let searchInput = $state("");
	let searchFilter = $state("");

	const getCardText = card =>
		[...card.front, ...(card.back ?? [])]
			.filter(block => block.type === "text")
			.map(block => ttGenerateText(block.content))
			.join(" ")
			.toLowerCase();

	let matchedCards = $derived(
		searchFilter
			? deck.cards.filter(card => getCardText(card).includes(searchFilter.toLowerCase()))
			: deck.cards
	);

	// the deck's own order, which the Order column shows and sorts by — the
	// place a stored per-card order will land
	let deckOrder = $derived(new Map(deck.cards.map((card, index) => [card.id, index])));

	// What each sortable column sorts on. A null sorts last whichever way the
	// column runs: those rows show "—", and a blank belongs at the end rather
	// than crowding whichever end is being read.
	const sortValues = {
		order: card => deckOrder.get(card.id),
		front: card => getFrontIndicator(card.front)?.toLowerCase() ?? null,
		type: card => (card.card_type === "tactic" ? 1 : 0),
		// the due date itself, so ascending is soonest-due first — the order
		// study takes them in — with cards finished for good last
		due: card => (card.finished_at ? null : Date.parse(card.due)),
		reps: card => card.reps,
		// the FSRS states run New, Learning, Review, Relearning in value order
		state: card => (card.card_type === "tactic" ? null : card.state)
	};

	const compareBy = (column, descending) => (a, b) => {
		const [x, y] = [sortValues[column](a), sortValues[column](b)];
		if (x === y) return 0;
		if (x == null) return 1;
		if (y == null) return -1;
		return (x < y ? -1 : 1) * (descending ? -1 : 1);
	}

	// A column is always sorted — Order ascending is the deck's own order, the
	// table's default. Sort is stable, so that order still decides ties.
	let filteredCards = $derived(
		[...matchedCards].sort(compareBy(draft.sortColumn, draft.sortDescending))
	);

	// a header sorts ascending, and flips direction from there; the way back to
	// the deck's order is the Order column, not a third click
	const toggleSort = column => {
		if (draft.sortColumn === column) {
			draft.sortDescending = !draft.sortDescending;
		} else {
			draft.sortColumn = column;
			draft.sortDescending = false;
		}
		multiSelected = new SvelteSet(selectedCard ? [selectedCard.id] : []);
		anchorIndex = selectedCard ? filteredCards.indexOf(selectedCard) : null;
	}

	const changeCardType = async (card, cardType) => {
		if (card.card_type === cardType) return;
		Object.assign(card, await updateCardType({ cardId: card.id, cardType }));
	}

	const applySearch = () => {
		searchFilter = searchInput.trim();
		multiSelected = new SvelteSet();
		anchorIndex = null;
		if (!filteredCards.includes(selectedCard)) selectedCard = filteredCards[0];
	}

	// ?q= opens the tab on a search (add-cards' "Show duplicates" link), over
	// whatever card the last visit left selected. The URL is the only thing the
	// effect watches — the search box is touched inside untrack, and the query
	// applied is remembered — so arriving again with a different q searches
	// again, while editing the box, which changes no URL, is left alone.
	let appliedQuery = null;
	$effect(() => {
		const q = page.url.searchParams.get("q");
		untrack(() => {
			if (q === appliedQuery) return;
			appliedQuery = q;
			if (q === null) return;
			searchInput = q;
			applySearch();
		});
	});

	// multi-selection is separate from selectedCard (the previewed card)
	let multiSelected = $state(new SvelteSet());
	let anchorIndex = $state(null);
	let dragging = $state(false);

	const selectRange = (from, to) => {
		const [a, b] = from < to ? [from, to] : [to, from];
		multiSelected = new SvelteSet(filteredCards.slice(a, b + 1).map(c => c.id));
	}

	const handleRowMouseDown = (e, card, index) => {
		if (e.button !== 0) return;
		selectedCard = card;
		if (e.shiftKey && anchorIndex !== null) {
			selectRange(anchorIndex, index);
		} else if (e.ctrlKey || e.metaKey) {
			if (multiSelected.has(card.id)) multiSelected.delete(card.id);
			else multiSelected.add(card.id);
			anchorIndex = index;
		} else {
			multiSelected = new SvelteSet([card.id]);
			anchorIndex = index;
			dragging = true;
		}
	}

	const handleRowMouseEnter = index => {
		if (dragging) selectRange(anchorIndex, index);
	}

	// { x, y } where the context menu is open, or null
	let contextMenu = $state(null);

	const handleRowContextMenu = (e, card, index) => {
		if (readonly) return;
		e.preventDefault();
		// right-clicking outside the current selection selects the clicked row instead
		if (!multiSelected.has(card.id)) {
			selectedCard = card;
			multiSelected = new SvelteSet([card.id]);
			anchorIndex = index;
		}
		contextMenu = { x: e.clientX, y: e.clientY };
	}

	const deleteCardsByIds = async ids => {
		const confirmed = await confirmModal({
			title: ids.length === 1 ? "Delete card" : `Delete ${ids.length} cards`,
			message: ids.length === 1
				? "This permanently deletes the card and its review history."
				: `This permanently deletes these ${ids.length} cards and their review history.`,
			confirmLabel: "Delete",
			danger: true
		});
		if (!confirmed) return;
		const index = filteredCards.indexOf(selectedCard);
		await deleteCards({ cardIds: ids });
		deck.cards = deck.cards.filter(card => !ids.includes(card.id));
		multiSelected = new SvelteSet();
		anchorIndex = null;
		stopEditing();
		selectedCard = filteredCards[Math.min(index, filteredCards.length - 1)];
	}

	const getFrontIndicator = front => {
		for (let i = 0; i < front.length; i++) {
			if (front[i].type === "text") {
				const ttGeneratedText = ttGenerateText(front[i].content);
				if (ttGeneratedText.length > 0) return ttGeneratedText;
			}
		}
		return null;
	}

	const stateNames = ["New", "Learning", "Review", "Relearning"];

	const formatDue = card => {
		if (card.finished_at) return "Never";
		if (card.card_type === "tactic")
			return Date.parse(card.due) > Date.now()
				? new Date(card.due).toLocaleDateString()
				: "New";
		return card.state === 0 ? "New" : new Date(card.due).toLocaleDateString();
	}

	// The keys the page claims (e, Up/Down, Delete) belong to a focused field
	// first — including the type dropdown, whose own arrows pick the type
	const inField = el =>
		el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT"
			|| el.isContentEditable;

	// Up/Down move through the cards. Page-level, not on the table: the
	// preview's boards take focus when clicked or scrolled, and from there
	// the table is not an ancestor, so a listener on it would never see the
	// keys. The board itself only claims Left/Right, for its moves.
	const navigateCards = e => {
		if (e.key === "ArrowUp") {
			e.preventDefault();
			selectedCard =
				filteredCards[Math.max(filteredCards.indexOf(selectedCard) - 1, 0)]
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			selectedCard =
				filteredCards[Math.min(
					filteredCards.indexOf(selectedCard) + 1, filteredCards.length - 1
				)]
		} else {
			return;
		}
		multiSelected = new SvelteSet([selectedCard.id]);
		anchorIndex = filteredCards.indexOf(selectedCard);
	}
</script>

<svelte:window
	onmouseup={() => dragging = false}
	onmousedown={() => contextMenu = null}
	onkeydown={e => {
		if (e.key === "Escape") {
			contextMenu = null;
		} else if (
			e.key === "e" && !e.ctrlKey && !e.metaKey && !e.altKey &&
			!readonly && selectedCard && !isEditingSelected &&
			!inField(e.target)
		) {
			e.preventDefault();
			startEditing();
		} else if (
			(e.key === "ArrowUp" || e.key === "ArrowDown") && selectedCard && !isEditingSelected &&
			!inField(e.target)
		) {
			navigateCards(e);
		} else if (
			e.key === "Delete" && !readonly && selectedCard && !isEditingSelected &&
			!inField(e.target)
		) {
			e.preventDefault();
			deleteCardsByIds(multiSelected.size > 0 ? [...multiSelected] : [selectedCard.id]);
		}
	}}
/>

{#if contextMenu}
	<div
		class="context-menu"
		role="menu"
		tabindex="-1"
		style="left: {contextMenu.x}px; top: {contextMenu.y}px"
		onmousedown={e => e.stopPropagation()}
	>
		{#if multiSelected.size === 1}
			<button
				onclick={() => {
					contextMenu = null;
					if (!isEditingSelected) startEditing();
				}}
			>
				Edit card
			</button>
		{/if}
		<button
			class="danger"
			onclick={() => {
				contextMenu = null;
				deleteCardsByIds([...multiSelected]);
			}}
		>
			{multiSelected.size > 1 ? `Delete ${multiSelected.size} cards` : "Delete card"}
		</button>
	</div>
{/if}

<div class="browse-container">
	<div class="left-pane">
		<input
			class="search-input"
			placeholder="Search cards"
			bind:value={searchInput}
			onkeydown={e => { if (e.key === "Enter") applySearch(); }}
		/>
		<div class="table-container">
		<!-- svelte-ignore a11y_autofocus -- table is the page's primary interaction target; focus enables arrow-key nav immediately -->
		<table
			role="grid"
			tabindex="0"
			autofocus
		>
			<thead>
				<tr>
					{#each [["order", "Order", "col-order"], ["front", "Front", ""], ["type", "Type", "col-type"], ["due", "Due", "col-due"], ["reps", "Reps", "col-reps"], ["state", "State", "col-state"]] as [column, label, cls]}
						<th
							class={cls}
							aria-sort={draft.sortColumn !== column
								? "none"
								: draft.sortDescending ? "descending" : "ascending"}
						>
							<button class="sort-btn" onclick={() => toggleSort(column)}>
								{label}
								{#if draft.sortColumn === column}
									<span class="sort-arrow">{draft.sortDescending ? "▾" : "▴"}</span>
								{/if}
							</button>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each filteredCards as card, cardIndex (card.id)}
					{@const indicator = getFrontIndicator(card.front)}
					{@const boardCount = card.front.find(block => block.type === "chessboards")?.content.length ?? 0}
					<tr
						class:active={card.id === selectedCard.id}
						class:multi-selected={multiSelected.has(card.id)}
						onmousedown={e => handleRowMouseDown(e, card, cardIndex)}
						onmouseenter={() => handleRowMouseEnter(cardIndex)}
						oncontextmenu={e => handleRowContextMenu(e, card, cardIndex)}
					>
						<td class="col-order">{deckOrder.get(card.id) + 1}</td>
						<td>
							{#if indicator}
								{indicator}
							{:else}
								<span class="board-only">{boardCount > 1 ? "{{chessboards}}" : "{{chessboard}}"}</span>
							{/if}
						</td>
						<td class:type-cell={!readonly}>
							{#if readonly}
								{card.card_type === "tactic" ? "Tactic" : "Basic"}
							{:else}
								<!-- the press is kept off the row: picking a type is not
								     selecting or sweeping through cards -->
								<select
									class="type-select"
									value={card.card_type}
									onmousedown={e => e.stopPropagation()}
									onchange={e => changeCardType(card, e.currentTarget.value)}
								>
									<option value="basic">Basic</option>
									<option value="tactic">Tactic</option>
								</select>
							{/if}
						</td>
						<td>{formatDue(card)}</td>
						<td>{card.reps ?? "—"}</td>
						<td>{card.card_type === "tactic" ? "—" : stateNames[card.state]}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		</div>
	</div>
	<div class="selected-card-container">
		{#if selectedCard}
			{#if isEditingSelected}
				<div class="card-edit card-surface">
					<CardBlockEdit
						card={selectedCard}
						session={draft.session}
						onSave={saveCard}
						onCancel={stopEditing}
					/>
				</div>
			{:else}
				<FlashcardBrowse card={selectedCard} />
				{#if !readonly}
					<div class="card-toolbar">
						<button class="std-btn" onclick={startEditing}>Edit card</button>
					</div>
				{/if}
			{/if}
		{/if}
	</div>
</div>

<style>
	:global(main:has(> .browse-container)) {
		display: flex;
		flex-direction: column;
		height: calc(100vh - 72px);
		min-height: 0;
		padding-bottom: 0;
	}
	.browse-container {
		display: flex;
		flex-grow: 1;
		min-height: 0;
	}
	.left-pane {
		background-color: white;
		border-right: 1px solid #dcdcdc;
		height: 100%;
		width: 680px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
	}
	.search-input {
		margin: 8px 6px;
		padding: 3px 16px;
		border: 1px solid #ccc;
		border-radius: 8px;
		font-size: 0.9rem;
	}
	.table-container {
		flex-grow: 1;
		min-height: 0;
		overflow-x: hidden;
		overflow-y: auto;
	}
	.table-container > table {
		table-layout: fixed;
		width: 100%;
		border-collapse: collapse;
	}
	.table-container > table:focus-visible {
		outline: none;
	}
	tbody {
		user-select: none;
	}
	tbody tr {
		cursor: pointer;
	}
	th {
		position: sticky;
		top: 0;
		background-color: white;
		text-align: left;
		font-weight: 600;
		font-size: 0.8rem;
		color: rgba(0, 0, 0, 0.6);
		border-bottom: 1px solid #dcdcdc;
		border-right: 1px solid #e5e5e5;
		/* the sort button carries the padding, so the whole header is the
		   click target rather than just its words */
		padding: 0;
	}
	.sort-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		width: 100%;
		padding: 4px 8px;
		border: none;
		background-color: transparent;
		font: inherit;
		color: inherit;
		text-align: left;
		cursor: pointer;
	}
	.sort-btn:hover {
		background-color: #f2f2f2;
	}
	.sort-arrow {
		font-size: 0.7rem;
		line-height: 1;
	}
	th:last-child {
		border-right: none;
	}
	.col-order {
		width: 62px;
	}
	.col-type {
		width: 86px;
	}
	.col-due {
		width: 100px;
	}
	.col-reps {
		width: 60px;
	}
	.col-state {
		width: 95px;
	}
	td {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		padding: 3px 8px;
		font-size: 0.875rem;
		color: #333;
		border-right: 1px solid #ececec;
		border-bottom: 1px solid #ececec;
	}
	/* the select is the cell: it fills the padding out to the borders, so the
	   box it becomes on hover is the whole white cell. Until then it reads as
	   the plain cell text it replaces — the border is already there, colourless,
	   and the arrow's room already reserved, so nothing shifts when it appears */
	.type-cell {
		padding: 0;
	}
	.type-select {
		display: block;
		width: 100%;
		appearance: none;
		border: 1px solid transparent;
		border-radius: 0;
		/* 2px + the border matches the 3px other cells pad with, so a row is
		   no taller for holding a dropdown */
		padding: 2px 20px 2px 8px;
		background-color: transparent;
		background-repeat: no-repeat;
		background-position: right 6px center;
		background-size: 8px 5px;
		font: inherit;
		color: inherit;
		cursor: pointer;
	}
	/* hover only: the box belongs to pointing at the cell and picking from it,
	   and must not linger on the click's leftover focus */
	.type-select:hover {
		border-color: black;
		background-color: white;
		background-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M0 0h10L5 6z' fill='black'/%3E%3C/svg%3E");
	}
	td:last-child {
		border-right: none;
	}
	tbody tr:nth-child(even) td {
		background-color: #f4f4f4;
	}
	tbody tr:hover td {
		background-color: #ececec;
	}
	tbody tr.multi-selected td {
		background-color: #e9f1fc;
	}
	tbody tr.active td {
		background-color: var(--accent-subtle-strong);
	}
	.board-only {
		color: rgba(0, 0, 0, 0.45);
		font-style: italic;
	}
	.selected-card-container {
		flex-grow: 1;
		min-width: 0;
		padding: 0 24px;
		height: 100%;
		overflow-y: auto;
	}
	/* sits bottom-right under the card it acts on */
	/* matches .card-surface's max-width so the buttons sit flush with the
	   card's right edge */
	.card-toolbar {
		display: flex;
		justify-content: end;
		gap: 8px;
		max-width: 900px;
		margin: 8px auto 40px auto;
	}
	.selected-card-container :global(.flashcard) {
		margin-top: 16px;
		margin-bottom: 0;
	}
	/* same inner inset as the add-cards page, whose editor this hosts */
	.card-edit {
		margin-top: 16px;
		margin-bottom: 0;
		padding: 12px 30px;
	}
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
	.context-menu button.danger {
		color: #c00;
	}
	.context-menu button:hover {
		background-color: #f0f0f0;
	}
</style>
