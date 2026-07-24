<script>
	// Readonly card browser: search + card table + selected card preview.
	// Same interaction as the my-flashcards browse page, without editing.
	import FlashcardBrowse from "$lib/components/FlashcardBrowse.svelte"
	import { ttGenerateText } from "$lib/tiptap-utility.js"

	let { cards } = $props();

	// svelte-ignore state_referenced_locally -- initial selection only; the user picks from there
	let selectedCard = $state(cards[0]);
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
			? cards.filter(card => getCardText(card).includes(searchFilter.toLowerCase()))
			: cards
	);

	const applySearch = () => {
		searchFilter = searchInput.trim();
		if (!filteredCards.includes(selectedCard)) selectedCard = filteredCards[0];
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

	const handleTableNav = e => {
		if (e.key === "ArrowUp") {
			e.preventDefault();
			selectedCard = filteredCards[Math.max(filteredCards.indexOf(selectedCard) - 1, 0)];
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			selectedCard = filteredCards[Math.min(filteredCards.indexOf(selectedCard) + 1, filteredCards.length - 1)];
		}
	}
</script>

<div class="browse-container">
	<div class="left-pane">
		<input
			class="search-input"
			placeholder="Search cards"
			bind:value={searchInput}
			onkeydown={e => { if (e.key === "Enter") applySearch(); }}
		/>
		<div class="table-container">
			<table role="grid" tabindex="0" onkeydown={handleTableNav}>
				<thead>
					<tr>
						<th>Front</th>
					</tr>
				</thead>
				<tbody>
					{#each filteredCards as card (card.id)}
						{@const indicator = getFrontIndicator(card.front)}
						{@const boardCount = card.front.find(block => block.type === "chessboards")?.content.length ?? 0}
						<tr
							class:active={selectedCard && card.id === selectedCard.id}
							onmousedown={() => selectedCard = card}
						>
							<td>
								{#if indicator}
									{indicator}
								{:else}
									<span class="board-only">{boardCount > 1 ? "{{chessboards}}" : "{{chessboard}}"}</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
	<div class="selected-card-container">
		{#if selectedCard}
			<FlashcardBrowse card={selectedCard} />
		{/if}
	</div>
</div>

<style>
	/* mirrors the my-flashcards browse page: full-height two-pane layout */
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
	table {
		table-layout: fixed;
		width: 100%;
		border-collapse: collapse;
	}
	table:focus-visible {
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
	}
	td {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		padding: 3px 8px;
		font-size: 0.875rem;
		color: #333;
		border-bottom: 1px solid #ececec;
	}
	tbody tr:nth-child(even) td {
		background-color: #f4f4f4;
	}
	tbody tr:hover td {
		background-color: #ececec;
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
</style>
