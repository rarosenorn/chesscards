<script>
	import StandardLayout from "$lib/components/StandardLayout.svelte"
	import FormErrors from "$lib/components/FormErrors.svelte"
	import FlashcardBrowse from "$lib/components/FlashcardBrowse.svelte"
	import { ttGenerateHTML } from "$lib/tiptap-utility.js"

	let { data, form } = $props();

	// mirrors the marketplace deck page's Description | Cards preview tabs,
	// client-side since this is a single review page
	let activeTab = $state("description");

	let previewCards = $derived(
		(data.request.previewCardIds ?? [])
			.map(id => data.request.cards.find(card => card.id === id))
			.filter(card => card !== undefined)
	);

	let rejectForm = $state();
	let rejectReason = $state("");

	const promptReject = () => {
		const reason = prompt("Reason for rejection (shown to the user):");
		if (reason === null || reason.trim() === "") return;
		rejectReason = reason.trim();
		// let svelte flush the hidden input's value before submitting
		setTimeout(() => rejectForm.requestSubmit());
	}
</script>

<StandardLayout>
	{#snippet headerActions()}
		{#if data.request.status === "pending"}
			<div class="review-actions">
				<form method="POST" action="?/approve">
					<button class="std-btn approve-btn">Approve</button>
				</form>
				<form method="POST" action="?/reject" bind:this={rejectForm}>
					<input type="hidden" name="reason" value={rejectReason} />
					<button type="button" class="std-btn reject-btn" onclick={promptReject}>Reject</button>
				</form>
			</div>
		{:else}
			<p class="status-note">This request has been {data.request.status}.</p>
		{/if}
	{/snippet}
	<FormErrors form={form} />
	<div class="deck-header">
		<img class="thumbnail" src="/admin/{data.request.id}/thumbnail" alt={data.request.name} />
		<div class="deck-side">
			<h2>{data.request.name}</h2>
			<div class="deck-info">
				<p><span>Author:</span> {data.request.email}</p>
				<p class="theme"><span>Theme:</span> {data.request.theme}</p>
				<p><span>No. of cards:</span> {data.request.cards.length}</p>
			</div>
			<!-- the buy button as buyers will see it; inert in the review -->
			<div>
				<button type="button" class="std-btn">{Number(data.request.price) === 0 ? "Get for free" : `Buy for ${data.request.price}$`}</button>
			</div>
		</div>
	</div>
	<div class="tabs">
		<button class:active={activeTab === "description"} onclick={() => activeTab = "description"}>
			Description
		</button>
		<button class:active={activeTab === "cards"} onclick={() => activeTab = "cards"}>
			Cards preview
		</button>
	</div>
	{#if activeTab === "description"}
		<div class="description">
			{@html ttGenerateHTML(data.request.description)}
		</div>
	{:else if previewCards.length === 0}
		<p class="no-preview">No preview cards</p>
	{:else}
		{#each previewCards as card (card.id)}
			<FlashcardBrowse {card} />
		{/each}
	{/if}
</StandardLayout>

<style>
	/* exact copy of the marketplace deck page header and tabs */
	.deck-header {
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
	h2 {
		font-size: 1.3rem;
	}
	.deck-info {
		margin-top: 8px;
		color: rgba(0, 0, 0, 0.6);
	}
	.theme {
		text-transform: capitalize;
	}
	.deck-side {
		height: 200px;
		display: flex;
		flex-direction: column;
	}
	.deck-info p {
		margin: 0 0 6px 0;
	}
	.deck-info span {
		font-weight: 600;
	}
	.deck-side div:last-child {
		margin-top: auto;
		margin-bottom: auto;
	}
	.tabs {
		margin-top: 24px;
		border-bottom: 1px solid #e3e1e1;
		display: flex;
		gap: 8px;
	}
	.tabs > button {
		border: none;
		background: none;
		cursor: pointer;
		color: rgba(0, 0, 0, 0.6);
		font-weight: 500;
		padding: 8px 12px;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
	}
	.tabs > button:hover {
		color: black;
		background-color: rgba(0, 0, 0, 0.03);
		border-radius: 4px 4px 0 0;
	}
	.tabs > button.active {
		color: black;
		font-weight: 600;
		border-bottom-color: var(--accent);
	}
	.description {
		margin: 16px 0;
		max-width: 70ch;
	}
	.description :global(p) {
		margin: 0 0 12px 0;
	}
	.no-preview {
		margin-top: 16px;
		color: rgba(0, 0, 0, 0.6);
	}
	.review-actions {
		display: flex;
		gap: 8px;
	}
	.approve-btn {
		background-color: var(--accent);
		color: white;
	}
	.reject-btn {
		background-color: #c62828;
		color: white;
	}
	.status-note {
		color: rgba(0, 0, 0, 0.6);
		font-size: 0.9rem;
	}
</style>
