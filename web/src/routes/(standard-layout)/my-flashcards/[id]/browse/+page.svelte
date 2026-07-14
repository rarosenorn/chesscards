<script>
	// TODO paneforge for reziing with slit
	// TODO align paragraph depending on lines
	// if single line: center 
	// if multiple line: left align
	// if more than 1 text editor and differing multi and single line: ?
	// TODO menu table arrow shortcut navigation with enter
	// TODO responsive ideas: medium deck table stacked on card table
	// small (phone) only deck and card table stacked, selected card in popover

	import { getContext } from "svelte"
	import { SvelteSet } from "svelte/reactivity"
	import FlashcardBrowse from "$lib/components/FlashcardBrowse.svelte"
	import CardSideEditor from "$lib/components/CardSideEditor.svelte"
	import { ttGenerateText } from "$lib/tiptap-utility.js"
	import { getSideJson, sideHasContent, countBoards, normalizeBoard } from "$lib/card-utils.js"
	import { updateCardContent, deleteCards } from "./browse.remote.js"

	let deck = getContext("deck");
	let selectedCard = $derived(deck.cards[0]);

	// id of the card open for editing; selecting another card falls back to view mode
	let editingCardId = $state(null);
	let editFront = $state([]);
	let editBack = $state([]);
	let editError = $state("");
	let isEditingSelected = $derived(selectedCard && editingCardId === selectedCard.id);
	let editFrontBoardCount = $derived(countBoards(editFront));
	let editShowBoardNumbers = $derived(editFrontBoardCount + countBoards(editBack) > 1);

	const toEditableSide = side =>
		(side ?? []).map(block => ({
			id: crypto.randomUUID(),
			type: block.type,
			textEditor: null,
			content: block.type === "chessboards"
				? block.content.map(board => normalizeBoard($state.snapshot(board)))
				: block.content
		}));

	const startEditing = () => {
		editFront = toEditableSide(selectedCard.front);
		editBack = toEditableSide(selectedCard.back);
		editError = "";
		editingCardId = selectedCard.id;
	}

	const stopEditing = () => editingCardId = null;

	// bound to the two CardSideEditor instances in edit mode
	let editFrontEditor, editBackEditor;

	const saveCard = async () => {
		if (editFrontEditor?.hasOpenEditors() || editBackEditor?.hasOpenEditors()) {
			editError = "All board editors must be closed (Ok or Cancel) before saving the card";
			return;
		}
		if (!sideHasContent(editFront)) {
			editError = "Front must have atleast 1 non-empty text field or 1 chessboard";
			return;
		}
		const front = getSideJson(editFront);
		const back = getSideJson(editBack);
		await updateCardContent({ cardId: selectedCard.id, front, back });
		selectedCard.front = JSON.parse(front);
		selectedCard.back = JSON.parse(back);
		editingCardId = null;
	}

	let searchInput = $state("");
	let searchFilter = $state("");

	const getCardText = card =>
		[...card.front, ...(card.back ?? [])]
			.filter(block => block.type === "text")
			.map(block => ttGenerateText(block.content))
			.join(" ")
			.toLowerCase();

	let filteredCards = $derived(
		searchFilter
			? deck.cards.filter(card => getCardText(card).includes(searchFilter.toLowerCase()))
			: deck.cards
	);

	const applySearch = () => {
		searchFilter = searchInput.trim();
		multiSelected = new SvelteSet();
		anchorIndex = null;
		if (!filteredCards.includes(selectedCard)) selectedCard = filteredCards[0];
	}

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
		const message = ids.length === 1 ? "Delete this card?" : `Delete ${ids.length} cards?`;
		if (!confirm(message)) return;
		const index = filteredCards.indexOf(selectedCard);
		await deleteCards({ cardIds: ids });
		deck.cards = deck.cards.filter(card => !ids.includes(card.id));
		multiSelected = new SvelteSet();
		anchorIndex = null;
		editingCardId = null;
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

	const formatDue = card =>
		card.state === 0 ? "New" : new Date(card.due).toLocaleDateString();

	const handleTableNav = async e => {
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
	onkeydown={e => { if (e.key === "Escape") contextMenu = null; }}
/>

{#if contextMenu}
	<div
		class="context-menu"
		role="menu"
		tabindex="-1"
		style="left: {contextMenu.x}px; top: {contextMenu.y}px"
		onmousedown={e => e.stopPropagation()}
	>
		<button
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
		<table
			role="grid"
			tabindex="0"
			onkeydown={handleTableNav}
			autofocus
		>
			<thead>
				<tr>
					<th>Front</th>
					<th class="col-due">Due</th>
					<th class="col-reps">Reps</th>
					<th class="col-state">State</th>
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
						<td>
							{#if indicator}
								{indicator}
							{:else}
								<span class="board-only">{boardCount > 1 ? "{{chessboards}}" : "{{chessboard}}"}</span>
							{/if}
						</td>
						<td>{formatDue(card)}</td>
						<td>{card.reps}</td>
						<td>{stateNames[card.state]}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		</div>
	</div>
	<div class="selected-card-container">
		{#if selectedCard}
			<div class="card-toolbar">
				{#if isEditingSelected}
					<button class="std-btn" onclick={saveCard}>Save</button>
					<button class="std-btn" onclick={stopEditing}>Cancel</button>
				{:else}
					<button class="std-btn" onclick={startEditing}>Edit card</button>
				{/if}
				<button class="std-btn delete-card-btn" onclick={() => deleteCardsByIds([selectedCard.id])}>
					Delete card
				</button>
			</div>
			{#if isEditingSelected}
				<div class="card-edit card-surface">
					<p class="side-indicator">Front</p>
					{#if editError}
						<p class="edit-error">{editError}</p>
					{/if}
					<CardSideEditor bind:this={editFrontEditor} side={editFront} boardNumberOffset={0} showBoardNumbers={editShowBoardNumbers} />
					<p class="side-indicator" style="margin-top: 10px;">Back</p>
					<CardSideEditor bind:this={editBackEditor} side={editBack} boardNumberOffset={editFrontBoardCount} showBoardNumbers={editShowBoardNumbers} />
				</div>
			{:else}
				<FlashcardBrowse card={selectedCard} />
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
		padding: 4px 8px;
		border-bottom: 1px solid #dcdcdc;
		border-right: 1px solid #e5e5e5;
	}
	th:last-child {
		border-right: none;
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
		background-color: #d8e8fb;
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
	.card-toolbar {
		display: flex;
		justify-content: end;
		gap: 8px;
		max-width: 950px;
		margin: 16px auto 0 auto;
	}
	.delete-card-btn {
		color: #c00;
	}
	.card-edit {
		margin-top: 12px;
		margin-bottom: 40px;
		padding: 12px 20px;
	}
	.side-indicator {
		margin-left: 14px;
		margin-bottom: 0px;
		font-size: 1.12rem;
		align-self: start;
	}
	.edit-error {
		color: red;
		margin: 4px 0 4px 16px;
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
		color: #c00;
	}
	.context-menu button:hover {
		background-color: #f0f0f0;
	}
</style>
