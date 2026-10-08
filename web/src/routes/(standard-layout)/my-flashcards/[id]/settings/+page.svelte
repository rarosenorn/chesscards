<script>
	import { enhance } from "$app/forms"
	import StandardLayout from "$lib/components/StandardLayout.svelte"
	import FormErrors from "$lib/components/FormErrors.svelte"
	import { typedConfirmModal } from "$lib/modals.svelte.js"
	import { subdeckLevels } from "$lib/subdecks.js"

	let { data, form } = $props();

	// How deep progression can run on this deck: not at all, one number for
	// each level short of its last, or every level it has. A deck with a
	// single level of subdecks has only the two ends to offer, which then
	// read as off and on. A stored depth that reaches the deck's last level
	// is the same as every level.
	let levels = $derived(subdeckLevels(data.deck.subdecks));
	let depths = $derived([
		{ value: "none", label: levels > 1 ? "None" : "Off" },
		...Array.from({ length: Math.max(0, levels - 1) }, (_, index) =>
			({ value: String(index + 1), label: index === 0 ? "1 level" : `${index + 1} levels` })),
		{ value: "all", label: levels > 1 ? "All levels" : "On" }
	]);
	let chosenDepth = $derived.by(() => {
		const depth = data.deck.progressionDepth;
		return depth === 0 ? "none" : depth === null || depth >= levels ? "all" : String(depth);
	});

	let deleteForm = $state();
	let resetForm = $state();

	const confirmReset = async () => {
		const confirmed = await typedConfirmModal({
			title: "Reset deck",
			message: "Resetting deck deletes all progress",
			requiredText: data.deck.name,
			confirmLabel: "Reset deck"
		});
		if (confirmed) resetForm.requestSubmit();
	}

	const confirmDelete = async () => {
		const confirmed = await typedConfirmModal({
			title: "Delete deck",
			message: `This permanently deletes "${data.deck.name}", its cards and their review history.`,
			requiredText: data.deck.name,
			confirmLabel: "Delete deck"
		});
		if (confirmed) deleteForm.requestSubmit();
	}
</script>

<StandardLayout>
	{#if !data.deck.isMarketplace}
	<section>
		<h3>Deck name</h3>
		<FormErrors form={form} />
		<form method="POST" action="?/rename" class="rename-form">
			<input
				name="name"
				value={form?.name ?? data.deck.name}
				required
				minlength="4"
				maxlength="100"
				autocomplete="off"
			/>
			<input name="id" type="hidden" value={data.deck.id} />
			<button class="std-btn">Rename</button>
		</form>
	</section>

	<section>
		<h3>Marketplace</h3>
		{#if data.uploadRequest?.status === "pending"}
			<p class="status status-pending">
				Upload request for "{data.uploadRequest.name}" is pending review ({data.uploadRequest.theme}).
			</p>
		{:else if data.uploadRequest?.status === "approved"}
			<p class="status status-approved">
				This deck is on the marketplace as "{data.uploadRequest.name}" ({data.uploadRequest.theme}).
			</p>
		{:else}
			{#if data.uploadRequest?.status === "rejected"}
				<p class="status status-rejected">
					Your upload request was rejected{data.uploadRequest.rejectionReason ? `: "${data.uploadRequest.rejectionReason}"` : ""}.
					You can request again.
				</p>
			{/if}
			<p class="section-note">Share this deck on the marketplace for others to use.</p>
			<a class="std-btn upload-btn" href="/my-flashcards/{data.deck.id}/request-upload">
				Request upload to marketplace
			</a>
		{/if}
	</section>
	{/if}

	<!-- nothing to gate without subdecks, so the switch only appears with them -->
	{#if data.deck.usesSubdecks}
	<section>
		<h3>Subdeck progression</h3>
		<p class="section-note">
			New cards arrive subdeck by subdeck — the next subdeck unlocks once
			the one before is learned.
			{#if levels > 1}
				Choose how many levels of subdecks that goes for: inside the
				last one that counts, everything is mixed.
			{/if}
			With none, every card is available from the start.
		</p>
		<form method="POST" action="?/progression" use:enhance onchange={e => e.currentTarget.requestSubmit()}>
			<div class="pills">
				{#each depths as option}
					<label class="pill" class:selected={chosenDepth === option.value}>
						<input type="radio" name="value" value={option.value} checked={chosenDepth === option.value} />
						{option.label}
					</label>
				{/each}
			</div>
		</form>
	</section>
	{/if}

	<!-- the danger zone is the one section a marketplace instance also gets:
	     resetting is its only destructive act, deleting stays the owner's -->
	<section class="danger-zone">
		<h3>Danger zone</h3>
		{#if form?.cards != null}
			<p class="status status-approved">
				Reset {form.cards} card{form.cards === 1 ? "" : "s"}.
			</p>
		{/if}
		<div class="danger-actions">
			<form bind:this={resetForm} method="POST" action="?/reset" use:enhance>
				<button type="button" class="danger-button" onclick={confirmReset}>Reset deck</button>
			</form>
			{#if !data.deck.isMarketplace}
			<form
				bind:this={deleteForm}
				method="POST"
				action="?/delete"
				use:enhance={() => {
					return ({ update }) => {
						update({ invalidateAll: false })
					}
				}}
			>
				<input type="hidden" name="id" value={data.deck.id} />
				<button type="button" class="danger-button" onclick={confirmDelete}>Delete deck</button>
			</form>
			{/if}
		</div>
	</section>
</StandardLayout>

<style>
	section {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: 8px;
		padding: 18px 0;
	}
	section + section {
		border-top: 1px solid rgba(0, 0, 0, 0.1);
	}
	section:first-child {
		padding-top: 0;
	}
	h3 {
		margin: 0;
		font-size: 1.05rem;
	}
	.section-note {
		margin: 0;
		font-size: 0.9rem;
		color: rgba(0, 0, 0, 0.6);
	}
	.rename-form {
		display: flex;
		gap: 8px;
	}
	.rename-form input {
		width: 280px;
		border: 1px solid rgba(0, 0, 0, 0.25);
		border-radius: 4px;
		padding: 6px 8px;
	}
	.status {
		margin: 0;
		padding: 8px 12px;
		border-radius: 5px;
		font-size: 0.95rem;
	}
	.status-pending {
		background-color: #fff7e0;
		border: 1px solid #e6d9a8;
	}
	.status-approved {
		background-color: #edf7ed;
		border: 1px solid #b7dcb9;
	}
	.status-rejected {
		background-color: #fdecea;
		border: 1px solid #f2b8b5;
		color: #c62828;
	}
	.upload-btn {
		text-decoration: none;
		color: inherit;
	}
	/* the depth choice, as the profile's three-way is drawn */
	.pills {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.pill {
		border: 1px solid rgba(0, 0, 0, 0.25);
		border-radius: 16px;
		padding: 4px 12px;
		cursor: pointer;
		font-size: 0.9rem;
		color: rgba(0, 0, 0, 0.75);
	}
	.pill:hover {
		background-color: gainsboro;
	}
	.pill.selected {
		background-color: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
	}
	/* the radio itself is visually hidden; keyboard focus shows on the pill */
	.pill input {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
	}
	.pill:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	.danger-actions {
		display: flex;
		gap: 8px;
	}
	.danger-button {
		color: #c62828;
		background-color: white;
		border: 1px solid #c62828;
		border-radius: 5px;
		padding: 6px 14px;
		cursor: pointer;
	}
	.danger-button:hover {
		color: white;
		background-color: #c62828;
	}
</style>
