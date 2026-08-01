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
	import { canonicalSideJson } from "$lib/card-utils.js"
	import { unlockedStageIds, stageLabel } from "$lib/stages.js"
	import { confirmModal } from "$lib/modals.svelte.js"
	import { updateCardContent, updateCardType, deleteCards, createStage, renameStage, deleteStage, moveCards } from "./browse.remote.js"

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
	// collapsed stage ids, kept across tab visits like the sort
	draft.collapsed ??= {};

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
	// the canonical front the duplicates filter matches on (add-cards' "Show
	// duplicates" link) — exact equality, boards included, unlike the text
	// search; running a search replaces it
	let dupFilter = $state(null);

	const getCardText = card =>
		[...card.front, ...(card.back ?? [])]
			.filter(block => block.type === "text")
			.map(block => ttGenerateText(block.content))
			.join(" ")
			.toLowerCase();

	let matchedCards = $derived(
		dupFilter
			? deck.cards.filter(card => canonicalSideJson(card.front) === dupFilter)
			: searchFilter
				? deck.cards.filter(card => getCardText(card).includes(searchFilter.toLowerCase()))
				: deck.cards
	);

	// --- stages ---
	// The deck's stages carry the order: the Order column reads
	// stage.position-in-stage ("2.17"), and with the table sorted by Order
	// and unfiltered, the rows sit grouped under collapsible stage headers.
	let stagesSorted = $derived([...deck.stages].sort((a, b) => a.position - b.position));
	let stagePositions = $derived(new Map(deck.stages.map(stage => [stage.id, stage.position])));
	let unlockedStages = $derived(unlockedStageIds(deck.stages, deck.cards));

	let stageCards = $derived.by(() => {
		const map = new Map(stagesSorted.map(stage => [stage.id, []]));
		for (const card of [...deck.cards].sort((a, b) => a.position - b.position)) {
			map.get(card.stage_id)?.push(card);
		}
		return map;
	});
	// "2.17" per card — from the sorted index, not the stored position, so a
	// gap the server has not renumbered yet cannot show through
	let orderLabels = $derived.by(() => {
		const labels = new Map();
		for (const stage of stagesSorted) {
			stageCards.get(stage.id).forEach((card, index) => labels.set(card.id, `${stage.position}.${index + 1}`));
		}
		return labels;
	});

	// Stage ops renumber across the deck, so they answer with the fresh deck;
	// land it in the shared context and re-find the selection among the new
	// card objects.
	const applyFresh = fresh => {
		const keep = selectedCard?.id;
		Object.assign(deck, fresh);
		selectedCard = deck.cards.find(card => card.id === keep) ?? deck.cards[0];
		multiSelected = new SvelteSet([...multiSelected].filter(id => deck.cards.some(card => card.id === id)));
		anchorIndex = null;
	}

	// What each sortable column sorts on. A null sorts last whichever way the
	// column runs: those rows show "—", and a blank belongs at the end rather
	// than crowding whichever end is being read.
	const sortValues = {
		order: card => stagePositions.get(card.stage_id) * 100000 + card.position,
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

	// The stage headers only frame the table when it shows the deck's own
	// order, whole: a search result or another column's sort is a flat list.
	let groupedRows = $derived.by(() => {
		if (draft.sortColumn !== "order" || searchFilter || dupFilter) return null;
		const stages = draft.sortDescending ? [...stagesSorted].reverse() : stagesSorted;
		return stages.map(stage => ({
			stage,
			cards: draft.sortDescending ? [...stageCards.get(stage.id)].reverse() : stageCards.get(stage.id),
			collapsed: !!draft.collapsed[stage.id]
		}));
	});

	// A column is always sorted — Order ascending is the deck's own order, the
	// table's default. Sort is stable, so that order still decides ties.
	// Grouped, this is the visible rows: a collapsed stage's cards drop out of
	// arrow navigation and range selection with their rows.
	let filteredCards = $derived(
		groupedRows
			? groupedRows.flatMap(group => group.collapsed ? [] : group.cards)
			: [...matchedCards].sort(compareBy(draft.sortColumn, draft.sortDescending))
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

	const resetSelection = () => {
		multiSelected = new SvelteSet();
		anchorIndex = null;
		if (!filteredCards.includes(selectedCard)) selectedCard = filteredCards[0];
	}

	const applySearch = () => {
		searchFilter = searchInput.trim();
		dupFilter = null;
		resetSelection();
	}

	// filter to the cards whose front exactly equals this card's — the card a
	// stale link points at may be gone, in which case nothing is filtered
	const applyDupFilter = cardId => {
		const card = deck.cards.find(c => c.id === cardId);
		if (!card) return;
		dupFilter = canonicalSideJson(card.front);
		searchInput = "";
		searchFilter = "";
		resetSelection();
	}

	const clearDupFilter = () => {
		dupFilter = null;
		resetSelection();
	}

	// ?q= opens the tab on a search, ?dupOf= on the exact-duplicates filter
	// (add-cards' "Show duplicates" link), over whatever card the last visit
	// left selected. The URL is the only thing the effect watches — the search
	// box is touched inside untrack, and the params applied are remembered —
	// so arriving again with a different param filters again, while editing
	// the box, which changes no URL, is left alone.
	let appliedQuery = null;
	let appliedDupOf = null;
	$effect(() => {
		const q = page.url.searchParams.get("q");
		const dupOf = page.url.searchParams.get("dupOf");
		untrack(() => {
			if (dupOf !== appliedDupOf) {
				appliedDupOf = dupOf;
				if (dupOf !== null) {
					applyDupFilter(dupOf);
					return;
				}
			}
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

	// --- reordering ---
	// The Order cell is the handle: a drag from it moves the selection (or its
	// own row) and drops before/after the row under the cursor, or onto a
	// stage header for the top of that stage; a plain click on it opens the
	// order for typing ("3.3" — stage, then place in stage). Both need the
	// grouped view; the drag also needs ascending, where "before" reads the
	// way the numbers run.
	let reorderDrag = $state(null);
	let orderEdit = $state(null);

	const handleOrderMouseDown = (e, card) => {
		if (e.button !== 0 || readonly || !groupedRows) return;
		e.stopPropagation();
		e.preventDefault();
		const cardIds = multiSelected.has(card.id)
			? filteredCards.filter(c => multiSelected.has(c.id)).map(c => c.id)
			: [card.id];
		reorderDrag = { cardIds, card, started: false, startX: e.clientX, startY: e.clientY, over: null };
	}

	const handleWindowMouseMove = e => {
		if (!reorderDrag || reorderDrag.started || draft.sortDescending) return;
		if (Math.abs(e.clientX - reorderDrag.startX) + Math.abs(e.clientY - reorderDrag.startY) > 5) {
			reorderDrag.started = true;
		}
	}

	const handleRowDragOver = (e, card) => {
		if (!reorderDrag?.started || reorderDrag.cardIds.includes(card.id)) return;
		const rect = e.currentTarget.getBoundingClientRect();
		const before = e.clientY < rect.top + rect.height / 2;
		const list = stageCards.get(card.stage_id).filter(c => !reorderDrag.cardIds.includes(c.id));
		reorderDrag.over = {
			stageId: card.stage_id,
			index: list.indexOf(card) + (before ? 0 : 1),
			cardId: card.id,
			before
		};
	}

	const handleStageDragOver = stage => {
		if (!reorderDrag?.started) return;
		reorderDrag.over = { stageId: stage.id, index: 0, headerId: stage.id };
	}

	const finishReorderDrag = async () => {
		const drag = reorderDrag;
		reorderDrag = null;
		if (!drag) return;
		if (!drag.started) {
			openOrderEdit(drag.card);
			return;
		}
		if (!drag.over) return;
		applyFresh(await moveCards({
			deckId: deck.id, cardIds: drag.cardIds, stageId: drag.over.stageId, index: drag.over.index
		}));
	}

	const openOrderEdit = card => {
		orderEdit = { cardId: card.id, value: orderLabels.get(card.id) };
	}

	// "3.3" makes the card the third of stage 3, pushing the rest along;
	// anything unparsable, an unknown stage, or an out-of-range place falls
	// back to the order as it stands
	const commitOrderEdit = async () => {
		const edit = orderEdit;
		orderEdit = null;
		if (!edit || edit.value === orderLabels.get(edit.cardId)) return;
		const match = edit.value.trim().match(/^(\d+)\.(\d+)$/);
		if (!match) return;
		const stage = stagesSorted.find(s => s.position === Number(match[1]));
		if (!stage) return;
		const place = Number(match[2]);
		const others = stageCards.get(stage.id).filter(c => c.id !== edit.cardId);
		if (place < 1 || place > others.length + 1) return;
		applyFresh(await moveCards({
			deckId: deck.id, cardIds: [edit.cardId], stageId: stage.id, index: place - 1
		}));
	}

	// --- stage management ---
	// the header's own context menu: rename inline, delete (its cards join the
	// neighbouring stage), with new stages appended from the row under the table
	let stageMenu = $state(null);
	let stageRename = $state(null);

	const handleStageContextMenu = (e, stage) => {
		if (readonly) return;
		e.preventDefault();
		e.stopPropagation();
		stageMenu = { x: e.clientX, y: e.clientY, stage };
	}

	const addStage = async () => applyFresh(await createStage({ deckId: deck.id, name: null }));

	const commitStageRename = async () => {
		const rename = stageRename;
		stageRename = null;
		if (!rename) return;
		applyFresh(await renameStage({ deckId: deck.id, stageId: rename.stageId, name: rename.value.trim() }));
	}

	const removeStage = async stageId =>
		applyFresh(await deleteStage({ deckId: deck.id, stageId }));

	const moveSelectedToStage = async stageId => {
		const cardIds = filteredCards.filter(c => multiSelected.has(c.id)).map(c => c.id);
		if (cardIds.length === 0) return;
		applyFresh(await moveCards({ deckId: deck.id, cardIds, stageId, index: null }));
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
	onmouseup={() => { dragging = false; finishReorderDrag(); }}
	onmousemove={handleWindowMouseMove}
	onmousedown={() => { contextMenu = null; stageMenu = null; }}
	onkeydown={e => {
		if (e.key === "Escape") {
			contextMenu = null;
			stageMenu = null;
			reorderDrag = null;
			orderEdit = null;
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
		{#if stagesSorted.length > 1}
			<div class="menu-heading">Move to</div>
			{#each stagesSorted as stage (stage.id)}
				<button
					onclick={() => {
						contextMenu = null;
						moveSelectedToStage(stage.id);
					}}
				>
					{stageLabel(stage)}
				</button>
			{/each}
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

{#if stageMenu}
	<div
		class="context-menu"
		role="menu"
		tabindex="-1"
		style="left: {stageMenu.x}px; top: {stageMenu.y}px"
		onmousedown={e => e.stopPropagation()}
	>
		<button
			onclick={() => {
				stageRename = { stageId: stageMenu.stage.id, value: stageMenu.stage.name ?? "" };
				stageMenu = null;
			}}
		>
			Rename stage
		</button>
		{#if stagesSorted.length > 1}
			<button
				class="danger"
				onclick={() => {
					const id = stageMenu.stage.id;
					stageMenu = null;
					removeStage(id);
				}}
			>
				Delete stage
			</button>
		{/if}
	</div>
{/if}

<div class="browse-container">
	<div class="left-pane">
		<div class="search-row">
			<input
				class="search-input"
				placeholder="Search cards"
				bind:value={searchInput}
				onkeydown={e => { if (e.key === "Enter") applySearch(); }}
			/>
			{#if dupFilter}
				<button class="dup-chip" onclick={clearDupFilter} aria-label="Clear the exact-duplicates filter">
					Exact duplicates <span class="dup-chip-x" aria-hidden="true">×</span>
				</button>
			{/if}
		</div>
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
									<span class="sort-arrow" class:descending={draft.sortDescending}></span>
								{/if}
							</button>
						</th>
					{/each}
				</tr>
			</thead>
			{#snippet cardRow(card)}
				{@const indicator = getFrontIndicator(card.front)}
				{@const boardCount = card.front.find(block => block.type === "chessboards")?.content.length ?? 0}
				<tr
					class:active={card.id === selectedCard.id}
					class:multi-selected={multiSelected.has(card.id)}
					class:drop-before={reorderDrag?.over?.cardId === card.id && reorderDrag.over.before}
					class:drop-after={reorderDrag?.over?.cardId === card.id && !reorderDrag.over.before}
					onmousedown={e => handleRowMouseDown(e, card, filteredCards.indexOf(card))}
					onmouseenter={() => handleRowMouseEnter(filteredCards.indexOf(card))}
					onmousemove={e => handleRowDragOver(e, card)}
					oncontextmenu={e => handleRowContextMenu(e, card, filteredCards.indexOf(card))}
				>
					<!-- the Order cell is the reorder handle: drag moves the row,
					     a plain click opens the number for typing -->
					<td
						class="col-order"
						class:order-handle={!readonly && groupedRows}
						onmousedown={orderEdit?.cardId === card.id ? undefined : e => handleOrderMouseDown(e, card)}
					>
						{#if orderEdit?.cardId === card.id}
							<!-- svelte-ignore a11y_autofocus -- the input exists because the user just clicked here -->
							<input
								class="order-input"
								autofocus
								bind:value={orderEdit.value}
								onblur={commitOrderEdit}
								onkeydown={e => {
									if (e.key === "Enter") commitOrderEdit();
									if (e.key === "Escape") orderEdit = null;
									e.stopPropagation();
								}}
							/>
						{:else}
							{orderLabels.get(card.id)}
						{/if}
					</td>
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
			{/snippet}
			<tbody>
				{#if groupedRows}
					{#each groupedRows as group (group.stage.id)}
						<tr
							class="stage-row"
							class:drop-into={reorderDrag?.over?.headerId === group.stage.id}
							onmousemove={() => handleStageDragOver(group.stage)}
							oncontextmenu={e => handleStageContextMenu(e, group.stage)}
						>
							<td colspan="6">
								{#if stageRename?.stageId === group.stage.id}
									<!-- svelte-ignore a11y_autofocus -- the input exists because the user just asked to rename -->
									<input
										class="stage-rename-input"
										autofocus
										placeholder="Stage {group.stage.position}"
										bind:value={stageRename.value}
										onblur={commitStageRename}
										onmousedown={e => e.stopPropagation()}
										onkeydown={e => {
											if (e.key === "Enter") commitStageRename();
											if (e.key === "Escape") { stageRename = null; e.stopPropagation(); }
											e.stopPropagation();
										}}
									/>
								{:else}
									<button class="stage-toggle" onmousedown={e => e.stopPropagation()} onclick={() => draft.collapsed[group.stage.id] = !group.collapsed}>
										<span class="collapse-arrow" class:collapsed={group.collapsed}></span>
										<span class="stage-name">{stageLabel(group.stage)}</span>
										{#if deck.stageProgression && !unlockedStages.has(group.stage.id)}
											<svg class="stage-lock" viewBox="0 0 16 16" aria-label="Locked" role="img">
												<rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/>
												<path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/>
											</svg>
										{/if}
									</button>
								{/if}
							</td>
						</tr>
						{#if !group.collapsed}
							{#each group.cards as card (card.id)}
								{@render cardRow(card)}
							{/each}
						{/if}
					{/each}
					{#if !readonly}
						<tr class="add-stage-row">
							<td colspan="6">
								<button class="add-stage-btn" onmousedown={e => e.stopPropagation()} onclick={addStage}>+ Add stage</button>
							</td>
						</tr>
					{/if}
				{:else}
					{#each filteredCards as card (card.id)}
						{@render cardRow(card)}
					{/each}
				{/if}
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
	/* The search gets a band of its own: white air holds it off the grey tab
	   strip above, and the table is ruled off below, so it belongs to neither.
	   Without it the field was white on white, flush against the tabs. */
	.search-row {
		flex: none;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px;
		border-bottom: 1px solid #dcdcdc;
	}
	.search-input {
		flex: 1;
	}
	/* the active duplicates filter, worn as a pill the click removes */
	.dup-chip {
		flex: none;
		margin: 0;
		padding: 4px 10px;
		border: 1px solid #ccc;
		border-radius: 999px;
		background-color: #f2f2f2;
		font-size: 0.85rem;
		white-space: nowrap;
		cursor: pointer;
	}
	.dup-chip:hover {
		background-color: #e8e8e8;
	}
	.dup-chip-x {
		margin-left: 2px;
		color: rgba(0, 0, 0, 0.55);
	}
	/* square like the table it heads, but a field you can see the edges of */
	.search-input {
		width: 100%;
		box-sizing: border-box;
		margin: 0;
		padding: 5px 8px 5px 29px;
		border: 1px solid #ccc;
		border-radius: 0;
		font-size: 0.9rem;
		background-color: white;
		background-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%23888' stroke-width='1.7' stroke-linecap='round'%3E%3Ccircle cx='6.8' cy='6.8' r='4.6'/%3E%3Cpath d='M10.3 10.3 14 14'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: left 8px center;
		background-size: 13px 13px;
	}
	/* the accent border the text editors take on focus, and no wider, so the
	   field never nudges the table below */
	.search-input:focus {
		outline: none;
		border-color: var(--accent);
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
		/* the arrow rides the cell's right edge, clear of the label */
		justify-content: space-between;
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
	/* cut from a box rather than set as a glyph: the edges stay straight and
	   the point sharp at this size, which ▴/▾ soften into a blur */
	.sort-arrow {
		flex: none;
		width: 9px;
		height: 6px;
		background-color: black;
		clip-path: polygon(50% 0, 100% 100%, 0 100%);
	}
	.sort-arrow.descending {
		clip-path: polygon(0 0, 100% 0, 50% 100%);
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
	/* pointing at the cell, not the click's leftover focus, is what raises the
	   box — so it does not linger on the row last changed */
	.type-select:hover {
		border-color: black;
		background-color: white;
		background-image: url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M0 0h10L5 6z' fill='black'/%3E%3C/svg%3E");
	}
	/* the list is down: the cell stays the box it was opened as, even with the
	   pointer away on the options. Its own rule — an :open a browser does not
	   know must not take the hover styling down with it */
	.type-select:open {
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
	/* sits bottom-right under the card it acts on, on the card's own width so
	   the buttons stay flush with its right edge */
	.card-toolbar {
		display: flex;
		justify-content: end;
		gap: 8px;
		max-width: var(--flashcard-width);
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
	/* --- stage rows --- */
	/* a band between the card rows, greyer than the zebra so it reads as
	   structure rather than another card (the selector out-weighs the zebra
	   and hover rules, which would otherwise repaint it as a card row) */
	tbody tr.stage-row td,
	tbody tr.stage-row:hover td {
		background-color: #e9e9e9;
		border-right: none;
		padding: 0;
		cursor: default;
	}
	.stage-toggle {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		padding: 4px 8px;
		border: none;
		background: none;
		font-size: 0.8rem;
		font-weight: 600;
		color: rgba(0, 0, 0, 0.65);
		cursor: pointer;
	}
	/* the sort arrow's cut, turned to point along the closed/open states */
	.collapse-arrow {
		flex: none;
		width: 6px;
		height: 9px;
		background-color: rgba(0, 0, 0, 0.55);
		clip-path: polygon(0 0, 100% 50%, 0 100%);
		transform: rotate(90deg);
	}
	.collapse-arrow.collapsed {
		transform: none;
	}
	.stage-lock {
		width: 13px;
		height: 13px;
		color: rgba(0, 0, 0, 0.55);
	}
	.stage-rename-input {
		width: 280px;
		margin: 1px 8px;
		padding: 2px 6px;
		border: 1px solid var(--accent);
		border-radius: 0;
		font-size: 0.8rem;
		font-weight: 600;
	}
	.stage-rename-input:focus {
		outline: none;
	}
	.add-stage-btn {
		width: 100%;
		padding: 4px 8px;
		border: none;
		background: none;
		text-align: left;
		font-size: 0.8rem;
		color: rgba(0, 0, 0, 0.45);
		cursor: pointer;
	}
	.add-stage-btn:hover {
		color: black;
	}
	tbody tr.add-stage-row td,
	tbody tr.add-stage-row:hover td {
		background-color: white;
		border-right: none;
		padding: 0;
		cursor: default;
	}
	/* --- reordering --- */
	.order-handle {
		cursor: grab;
	}
	/* the drop target: an accent rule on the edge the cards would land at */
	tr.drop-before td {
		box-shadow: inset 0 2px 0 var(--accent);
	}
	tr.drop-after td {
		box-shadow: inset 0 -2px 0 var(--accent);
	}
	tr.stage-row.drop-into td {
		box-shadow: inset 0 -2px 0 var(--accent);
	}
	.order-input {
		width: 100%;
		box-sizing: border-box;
		margin: 0;
		padding: 0 2px;
		border: 1px solid var(--accent);
		border-radius: 0;
		font: inherit;
	}
	.order-input:focus {
		outline: none;
	}
	.menu-heading {
		padding: 4px 12px 2px 12px;
		font-size: 0.75rem;
		color: rgba(0, 0, 0, 0.45);
		border-top: 1px solid #eee;
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
