<script>
	import { tick } from "svelte"
	import FlashcardBrowse from "$lib/components/FlashcardBrowse.svelte"
	import { ttGenerateText } from "$lib/tiptap-utility.js"

	// Choosing a deck's sample cards: the deck's cards on the left, the chosen
	// ones stacked in the middle as buyers will see them, their order on the
	// right with the host's footer (its buttons) under it. Full height, below
	// the host's own nav bar.
	let { cards, previewIds = $bindable(), footer } = $props();

	// the card currently shown as an addition candidate at the bottom of the
	// stack of chosen ones
	let candidateId = $state(null);

	let searchInput = $state("");
	let cardElements = {};
	let candidateElement = $state(null);
	let hintElement = $state(null);

	const getCardText = card =>
		[...card.front, ...(card.back ?? [])]
			.filter(block => block.type === "text")
			.map(block => ttGenerateText(block.content))
			.join(" ")
			.toLowerCase();

	let filteredCards = $derived(
		searchInput.trim()
			? cards.filter(card => getCardText(card).includes(searchInput.trim().toLowerCase()))
			: cards
	);

	const cardLabel = card => {
		for (const block of card.front) {
			if (block.type === "text") {
				const text = ttGenerateText(block.content);
				if (text.length > 0) return text;
			}
		}
		return "{{chessboard}}";
	}

	const cardById = id => cards.find(card => card.id === id);

	const scrollToCard = id =>
		cardElements[id]?.scrollIntoView({ behavior: "smooth", block: "start" });

	// a row click previews an unselected card as candidate;
	// for an already selected card it jumps to its place in the stack
	const handleRowClick = async id => {
		if (previewIds.includes(id)) {
			scrollToCard(id);
			return;
		}
		candidateId = id;
		await tick();
		candidateElement?.scrollIntoView({ behavior: "smooth", block: "start" });
	}

	const addCandidate = async () => {
		const id = candidateId;
		previewIds.push(id);
		candidateId = null;
		await tick();
		// show the tail of the added card together with the pick-next hint
		hintElement?.scrollIntoView({ behavior: "smooth", block: "end" });
	}

	// moves a card to a 1-based position; the card there and all after shift down
	const repositionCard = (fromIndex, position) => {
		let to = Math.round(Number(position)) - 1;
		if (!Number.isFinite(to)) return;
		to = Math.max(0, Math.min(previewIds.length - 1, to));
		const [id] = previewIds.splice(fromIndex, 1);
		previewIds.splice(to, 0, id);
	}

	// chips are only draggable while grabbed by their handle, so text
	// selection in the position input never starts a drag
	let dragIndex = $state(null);
	let dragOverIndex = $state(null);
	let armedIndex = $state(null);

	const handleDrop = index => {
		if (dragIndex === null || dragIndex === index) return;
		const [id] = previewIds.splice(dragIndex, 1);
		previewIds.splice(index, 0, id);
	}

</script>

<div class="picker-container">
	<div class="left-pane">
		<input
			class="search-input"
			placeholder="Search cards"
			bind:value={searchInput}
		/>
		<div class="table-container">
			<table>
				<thead>
					<tr>
						<th>Front</th>
					</tr>
				</thead>
				<tbody>
					{#each filteredCards as card (card.id)}
						{@const previewIndex = previewIds.indexOf(card.id)}
						<tr
							class:candidate-row={card.id === candidateId}
							class:in-preview={previewIndex !== -1}
							onmousedown={() => handleRowClick(card.id)}
						>
							<td>
								<span class="row-label">{cardLabel(card)}</span>
								{#if previewIndex !== -1}
									<span class="row-badge">#{previewIndex + 1}</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
	<div class="preview-pane">
		{#each previewIds as id (id)}
			<div class="stack-item" bind:this={cardElements[id]}>
				<FlashcardBrowse card={cardById(id)} />
			</div>
		{/each}
		{#if candidateId}
			<div class="candidate" bind:this={candidateElement}>
				<FlashcardBrowse card={cardById(candidateId)} />
				<div class="candidate-actions">
					<button type="button" class="std-btn" onclick={() => candidateId = null}>Cancel</button>
					<button type="button" class="std-btn add-btn" onclick={addCandidate}>Add to preview</button>
				</div>
			</div>
		{:else}
			<p class="pick-hint" bind:this={hintElement}>
				{previewIds.length === 0
					? "Pick a card from the list to see it here as buyers will"
					: "Pick another card from the list to add it"}
			</p>
		{/if}
	</div>
	<div class="minimap">
		<p class="minimap-title">Preview order</p>
		<div class="minimap-chips">
		{#if previewIds.length === 0}
			<p class="minimap-empty">No cards chosen yet</p>
		{/if}
		{#each previewIds as id, index (id)}
			<!-- svelte-ignore a11y_no_static_element_interactions -- drag reordering is a convenience; the position input is the accessible control -->
			<div
				class="chip"
				class:dragging={dragIndex === index}
				class:drag-over={dragOverIndex === index && dragIndex !== index}
				draggable={armedIndex === index}
				ondragstart={e => { dragIndex = index; e.dataTransfer.effectAllowed = "move"; }}
				ondragover={e => { e.preventDefault(); dragOverIndex = index; }}
				ondrop={e => { e.preventDefault(); handleDrop(index); }}
				ondragend={() => { dragIndex = null; dragOverIndex = null; armedIndex = null; }}
			>
				<span
					class="drag-handle"
					title="Drag to reorder"
					onmousedown={() => armedIndex = index}
					onmouseup={() => armedIndex = null}
				>
					⠿
				</span>
				<input
					class="chip-input"
					type="number"
					min="1"
					max={previewIds.length}
					value={index + 1}
					aria-label="Position"
					onchange={e => {
						repositionCard(index, e.target.value);
						e.target.value = previewIds.indexOf(id) + 1;
					}}
					onkeydown={e => { if (e.key === "Enter") e.target.blur(); }}
				/>
				<button type="button" class="chip-label" onclick={() => scrollToCard(id)}>
					<span class="chip-text">{cardLabel(cardById(id))}</span>
				</button>
				<button
					type="button"
					class="order-btn"
					aria-label="Remove from preview"
					onclick={() => previewIds.splice(index, 1)}
				>
					×
				</button>
			</div>
		{/each}
		</div>
		<div class="picker-footer">
			{@render footer()}
		</div>
	</div>
</div>

<style>
	/* full-height three-pane layout below topbar and nav bar, like browse */
	:global(main:has(> .picker-container)) {
		display: flex;
		flex-direction: column;
		height: calc(100vh - 72px);
		min-height: 0;
		padding-bottom: 0;
	}
	.picker-container {
		display: flex;
		flex-grow: 1;
		min-height: 0;
	}
	.left-pane {
		background-color: white;
		border-right: 1px solid #dcdcdc;
		height: 100%;
		width: 340px;
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
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 3px 8px;
		font-size: 0.875rem;
		color: #333;
		border-bottom: 1px solid #ececec;
	}
	.row-label {
		flex: 1;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.row-badge {
		flex-shrink: 0;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--accent);
	}
	tbody tr:nth-child(even) td {
		background-color: #f4f4f4;
	}
	tbody tr:hover td {
		background-color: #ececec;
	}
	tbody tr.in-preview td {
		background-color: var(--accent-subtle);
	}
	tbody tr.candidate-row td {
		background-color: var(--accent-subtle-strong);
	}

	.preview-pane {
		flex-grow: 1;
		min-width: 0;
		height: 100%;
		overflow-y: auto;
		padding: 0 24px;
	}
	/* the dashed frame is the card plus its own 12px of air, read off the
	   card's width rather than repeated: at a fixed number the frame either
	   squeezed the card narrower than it renders anywhere else or drifted
	   away from it whenever that width changed */
	.candidate {
		border: 2px dashed var(--accent);
		border-radius: 8px;
		padding: 0 12px;
		margin: 32px auto 24px auto;
		max-width: calc(var(--flashcard-width) + 24px);
	}
	.candidate :global(.flashcard) {
		margin-top: 12px;
		margin-bottom: 0;
	}
	.candidate-actions {
		display: flex;
		justify-content: center;
		gap: 8px;
		padding: 12px 0;
	}
	.add-btn {
		background-color: var(--accent);
		color: white;
	}
	.pick-hint {
		text-align: center;
		color: rgba(0, 0, 0, 0.6);
		margin: 32px 0 40px 0;
	}

	.minimap {
		background-color: white;
		border-left: 1px solid #dcdcdc;
		height: 100%;
		width: 340px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.minimap-chips {
		flex-grow: 1;
		min-height: 0;
		overflow-y: auto;
	}
	.picker-footer {
		border-top: 1px solid #dcdcdc;
		padding: 10px 12px;
	}
	.minimap-title {
		position: sticky;
		top: 0;
		background-color: white;
		font-size: 0.8rem;
		font-weight: 600;
		color: rgba(0, 0, 0, 0.6);
		padding: 4px 8px;
		border-bottom: 1px solid #dcdcdc;
		margin: 0;
	}
	.minimap-empty {
		font-size: 0.85rem;
		color: rgba(0, 0, 0, 0.5);
		padding: 8px;
		margin: 0;
	}
	.chip {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 8px;
		border-bottom: 1px solid #ececec;
		border-top: 2px solid transparent;
	}
	.chip.dragging {
		opacity: 0.4;
	}
	.chip.drag-over {
		border-top-color: var(--accent);
	}
	.drag-handle {
		flex-shrink: 0;
		color: rgba(0, 0, 0, 0.4);
		cursor: grab;
		user-select: none;
		padding: 6px 8px;
		margin: -6px -2px -6px -4px;
	}
	.chip-input {
		flex-shrink: 0;
		width: 34px;
		text-align: center;
		font-size: 0.85rem;
		border: 1px solid rgba(0, 0, 0, 0.2);
		border-radius: 4px;
		padding: 1px 2px;
		appearance: textfield;
	}
	.chip-input::-webkit-outer-spin-button,
	.chip-input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
	.chip-label {
		flex: 1;
		min-width: 0;
		border: none;
		background: none;
		padding: 0;
		cursor: pointer;
		text-align: left;
	}
	.chip-label:hover .chip-text {
		text-decoration: underline;
	}
	.chip-text {
		display: block;
		min-width: 0;
		font-size: 0.85rem;
		color: #333;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.order-btn {
		border: 1px solid rgba(0, 0, 0, 0.2);
		border-radius: 4px;
		background-color: white;
		width: 22px;
		height: 22px;
		line-height: 1;
		font-size: 0.8rem;
		cursor: pointer;
	}
	.order-btn:hover:enabled {
		background-color: gainsboro;
	}
	.order-btn:disabled {
		color: rgba(0, 0, 0, 0.3);
		cursor: default;
	}
</style>
