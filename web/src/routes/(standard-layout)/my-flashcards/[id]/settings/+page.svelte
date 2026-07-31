<script>
	import { enhance } from "$app/forms"
	import StandardLayout from "$lib/components/StandardLayout.svelte"
	import FormErrors from "$lib/components/FormErrors.svelte"
	import { confirmModal, typedConfirmModal } from "$lib/modals.svelte.js"

	let { data, form } = $props();

	let deleteForm;
	let resetForm;

	const confirmReset = async () => {
		const confirmed = await confirmModal({
			title: "Reset deck",
			message: "Every card goes back to new and the whole deck comes up for review again. The review history is kept.",
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

	<section>
		<h3>Study progress</h3>
		<p class="section-note">
			Puts every card back to new: scheduling starts over, finished tactics
			return, and the whole deck is due again. The review history is kept —
			your statistics still count every review you have done.
		</p>
		{#if form?.cards != null}
			<p class="status status-approved">
				Reset {form.cards} card{form.cards === 1 ? "" : "s"}.
			</p>
		{/if}
		<form bind:this={resetForm} method="POST" action="?/reset" use:enhance>
			<button type="button" class="std-btn" onclick={confirmReset}>Reset deck</button>
		</form>
	</section>

	{#if !data.deck.isMarketplace}
	<section class="danger-zone">
		<h3>Danger zone</h3>
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
			<button type="button" class="delete-button" onclick={confirmDelete}>Delete deck</button>
		</form>
	</section>
	{/if}
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
	.delete-button {
		color: #c62828;
		background-color: white;
		border: 1px solid #c62828;
		border-radius: 5px;
		padding: 6px 14px;
		cursor: pointer;
	}
	.delete-button:hover {
		color: white;
		background-color: #c62828;
	}
</style>
