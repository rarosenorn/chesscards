<script>
	import { tick } from "svelte"
	import { goto } from "$app/navigation"
	import { page } from "$app/state"
	import { deserialize } from "$app/forms"
	import FlashcardBrowse from "$lib/components/FlashcardBrowse.svelte"
	import { ttGenerateHTML, ttGenerateText } from "$lib/tiptap-utility.js"

	let { data } = $props();

	// two-step wizard, client-side: a real route would destroy the selection
	// state on every switch.
	// step 1 = the listing + price, step 2 = choose preview cards + send the request
	let step = $state(1);

	let price = $state(0);
	let errors = $state([]);
	let submitting = $state(false);

	// ordered ids of the cards chosen for the public preview, plus the card
	// currently shown as an addition candidate at the bottom of the stack
	let previewIds = $state([]);
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
			? data.deck.cards.filter(card => getCardText(card).includes(searchInput.trim().toLowerCase()))
			: data.deck.cards
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

	const cardById = id => data.deck.cards.find(card => card.id === id);

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

	// the listing is the deck's own, edited in its Deck tab, and the request
	// is made from it; what it still lacks is listed here and again by the
	// server on submit
	let listing = $derived(data.listing);
	const detailsErrors = () => [
		...(listing.name.length < 4 || listing.name.length > 100 ? ["Name must be between 4 and 100 characters"] : []),
		...(listing.imageVersion ? [] : ["A thumbnail image is required"]),
		...(listing.theme ? [] : ["A theme is required"]),
		...(listing.description && ttGenerateText(listing.description).trim().length > 0 ? [] : ["A description is required"])
	];

	// the details <form>'s submit handler: its native validation has passed
	const goNext = () => {
		errors = detailsErrors();
		if (errors.length === 0) step = 2;
	}

	const submit = async () => {
		errors = detailsErrors();
		if (errors.length > 0) return;
		submitting = true;
		try {
			const formData = new FormData();
			formData.set("price", price.toString());
			formData.set("previewCardIds", JSON.stringify(previewIds));

			const response = await fetch("?/requestUpload", {
				method: "POST",
				headers: { "x-sveltekit-action": "true" },
				body: formData
			});
			const result = deserialize(await response.text());
			if (result.type === "success") {
				await goto(`/my-flashcards/${page.params.id}/settings`, { invalidateAll: true });
			} else {
				errors = result.data?.errors ?? ["Something went wrong. Please try again."];
			}
		} catch (err) {
			// network failure or unparseable response — and anything thrown
			// while building the request, which this message disguises as one,
			// so the real error goes to the console
			console.error(err);
			errors = ["Could not reach the server. Check your connection and try again."];
		} finally {
			submitting = false;
		}
	}
</script>

<div class="request-nav-container">
	<div class="breadcrumbs">
		<a href="/my-flashcards">My flashcards</a>
		<span>{"->"}</span>
		<a href="/my-flashcards/{page.params.id}/settings">{data.deck.name}</a>
		<span>{"->"}</span>
		<span>Request upload</span>
	</div>
	<div class="steps">
		<button class="step" class:active={step === 1} onclick={() => step = 1}>
			1. Details
		</button>
		<span class="step-arrow">{"->"}</span>
		<!-- moving forward runs the same validation as the Next button -->
		<button class="step" class:active={step === 2} onclick={() => { if (step === 1) goNext(); }}>
			2. Preview cards ({previewIds.length})
		</button>
	</div>
</div>

{#if step === 1}
	<div class="details-panel">
		<h1>Request upload to marketplace</h1>
		<p class="section-note">
			The listing is the deck's own: change it in the <a href="/my-flashcards/{page.params.id}/deck">Deck tab</a>.
		</p>
		<div class="listing">
			{#if listing.imageVersion}
				<img
					class="thumbnail"
					src="/my-flashcards/{page.params.id}/thumbnail?v={listing.imageVersion}"
					alt={listing.name}
				/>
			{:else}
				<div class="thumbnail placeholder">No thumbnail</div>
			{/if}
			<div>
				<h2>{listing.name}</h2>
				<p class="theme"><span>Theme:</span> {listing.theme ?? "none"}</p>
			</div>
		</div>
		{#if listing.description}
			<div class="description">
				{@html ttGenerateHTML(listing.description)}
			</div>
		{/if}
		<form onsubmit={e => { e.preventDefault(); goNext(); }}>
			<label for="mp-price">Price</label>
			<input id="mp-price" class="natural-width" type="number" bind:value={price} min="0" max="999.99" step="0.01" required />

			{#if errors.length > 0}
				<ul class="errors">
					{#each errors as error}
						<li>{error}</li>
					{/each}
				</ul>
			{/if}

			<div class="form-actions">
				<a class="std-btn" href="/my-flashcards/{page.params.id}/settings">Cancel</a>
				<button class="std-btn">Next</button>
			</div>
		</form>
	</div>
{:else}
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
			<div class="request-footer">
				{#if errors.length > 0}
					<ul class="errors">
						{#each errors as error}
							<li>{error}</li>
						{/each}
					</ul>
				{/if}
				<div class="footer-buttons">
					<button type="button" class="std-btn" onclick={() => step = 1}>Back</button>
					<button type="button" class="std-btn request-btn" disabled={submitting} onclick={submit}>
						Request upload
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	/* same nav bar as the deck and admin review pages */
	.request-nav-container {
		display: flex;
		box-shadow: inset 0 -4px 6px -4px rgba(0, 0, 0, 0.2);
		align-items: center;
		padding-top: 8px;
		padding-left: 30px;
		padding-right: 30px;
		gap: 20px;
	}
	.steps {
		display: flex;
		align-items: center;
		gap: 8px;
		padding-bottom: 8px;
	}
	.step {
		border: none;
		background: none;
		padding: 4px 6px;
		font-size: 0.95rem;
		color: rgba(0, 0, 0, 0.45);
		cursor: pointer;
	}
	.step.active {
		color: var(--accent);
		font-weight: 600;
	}
	.step:hover:not(.active) {
		color: black;
	}
	.step-arrow {
		color: rgba(0, 0, 0, 0.35);
	}
	.breadcrumbs a {
		color: black;
	}
	.breadcrumbs a:hover {
		color: blue;
	}

	.details-panel {
		max-width: 1000px;
		margin: 25px auto 0 auto;
		background-color: white;
		padding: 25px;
	}
	.details-panel h1 {
		font-size: 1.5rem;
		margin-bottom: 20px;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 6px;
		max-width: 720px;
	}
	label {
		margin-top: 8px;
		margin-bottom: 0;
		font-weight: 500;
	}
	.natural-width {
		align-self: start;
		width: auto;
	}
	#mp-price {
		width: 90px;
	}
	.section-note {
		margin: 0 0 16px 0;
		color: rgba(0, 0, 0, 0.6);
	}
	.listing {
		display: flex;
		gap: 30px;
		align-items: start;
	}
	.thumbnail {
		width: 300px;
		aspect-ratio: 3 / 2;
		object-fit: cover;
		border-radius: 4px;
	}
	.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: #eff1f3;
		color: rgba(0, 0, 0, 0.5);
	}
	.listing h2 {
		font-size: 1.3rem;
	}
	.theme {
		margin: 8px 0 0 0;
		color: rgba(0, 0, 0, 0.6);
		text-transform: capitalize;
	}
	.theme span {
		font-weight: 600;
	}
	.description {
		margin: 16px 0 0 0;
		max-width: 70ch;
	}
	.description :global(p) {
		margin: 0 0 12px 0;
	}
	.errors {
		color: red;
		padding-left: 16px;
		margin: 8px 0 0 0;
	}
	.form-actions {
		display: flex;
		justify-content: end;
		gap: 8px;
		margin-top: 16px;
	}
	.form-actions a {
		text-decoration: none;
		color: inherit;
	}

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
	.request-footer {
		border-top: 1px solid #dcdcdc;
		padding: 10px 12px;
	}
	.request-footer .errors {
		margin: 0 0 8px 0;
	}
	.footer-buttons {
		display: flex;
		justify-content: end;
		gap: 8px;
	}
	.request-btn {
		background-color: var(--accent);
		border-color: var(--accent);
		color: white;
	}
	.request-btn:hover:enabled {
		background-color: var(--accent-hover);
	}
	.request-btn:disabled {
		opacity: 0.6;
		cursor: default;
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
