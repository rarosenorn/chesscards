<script>
	import { enhance } from "$app/forms"
	import StandardLayout from "$lib/components/StandardLayout.svelte"
	import FormErrors from "$lib/components/FormErrors.svelte"
	import { typedConfirmModal } from "$lib/modals.svelte.js"
	import { forgetIntrosRead } from "$lib/intros.js"

	let { data, form } = $props();

	// whether there are decks inside it to take in order or mixed
	let holdsDecks = $derived(data.deck.decks.length > 1);
	// a marketplace deck taken, as against a deck inside one
	let isTaken = $derived(data.deck.isMarketplace && data.deck.id === data.deck.instanceId);
	// a marketplace deck taken somewhere inside it, which deleting it does not take
	let takenInside = $derived(data.deck.decks.some(entry => entry.bought && entry.id === entry.instance_id && entry.id !== data.deck.id));

	// a ladder said in words: "14, 60 and 180 days"
	const days = ladder => ladder.length === 1
		? `${ladder[0]} day${ladder[0] === 1 ? "" : "s"}`
		: `${ladder.slice(0, -1).join(", ")} and ${ladder.at(-1)} days`;

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
		const confirmed = await typedConfirmModal(isTaken
			? {
				title: "Remove deck",
				message: `This removes "${data.deck.name}" from your decks, and your progress on it. You can take it again from the marketplace.`,
				requiredText: data.deck.name,
				confirmLabel: "Remove deck"
			}
			: {
				title: "Delete deck",
				message: `This permanently deletes "${data.deck.name}", every deck and card inside it and their progress.`
					+ (takenInside ? " The marketplace decks inside it move to the top of your list." : ""),
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
				maxlength="100"
				autocomplete="off"
			/>
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
		{:else if data.holdsTaken}
			<p class="section-note">
				A marketplace deck sits inside this deck, so it cannot be shared:
				only what is your own can go on the marketplace.
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

	<!-- nothing to order without decks inside, so the choice only appears with them -->
	{#if holdsDecks}
	<section>
		<h3>Decks inside</h3>
		<p class="section-note">
			In order: new cards arrive deck by deck — the next deck opens once the
			one before is learned (the cards of this deck itself come first).
			Mixed: every deck inside is open from the start, and new cards come
			from each in turn.
			{#if data.deck.isMarketplace}This is your own choice; it starts as the author's.{/if}
		</p>
		<form method="POST" action="?/inOrder" use:enhance onchange={e => e.currentTarget.requestSubmit()}>
			<div class="pills">
				{#each [{ value: "in-order", label: "In order" }, { value: "mixed", label: "Mixed" }] as option}
					{@const chosen = (option.value === "in-order") === data.deck.inOrder}
					<label class="pill" class:selected={chosen}>
						<input type="radio" name="value" value={option.value} checked={chosen} />
						{option.label}
					</label>
				{/each}
			</div>
		</form>
	</section>
	{/if}

	<!-- said at the top of the list only: everything inside follows it -->
	{#if data.deck.ancestors.length === 0}
	<section>
		<h3>Due cards</h3>
		<p class="section-note">
			Mixed: cards due for review come shuffled.
			In order: they come in the order new cards do — for lines best seen in
			sequence, like openings. Every deck inside this one follows it.
			{#if data.deck.isMarketplace}This is your own choice; it starts as the author's.{/if}
		</p>
		<form method="POST" action="?/reviewsInOrder" use:enhance onchange={e => e.currentTarget.requestSubmit()}>
			<div class="pills">
				{#each [{ value: "in-order", label: "In order" }, { value: "mixed", label: "Mixed" }] as option}
					{@const chosen = (option.value === "in-order") === data.deck.reviewsInOrder}
					<label class="pill" class:selected={chosen}>
						<input type="radio" name="value" value={option.value} checked={chosen} />
						{option.label}
					</label>
				{/each}
			</div>
		</form>
	</section>
	{/if}

	<!-- the author's on a marketplace deck, so there only said -->
	<section>
		<h3>Tactic cards</h3>
		{#if data.deck.isMarketplace}
			<p class="section-note">
				A tactic card is shown {data.deck.decks[0].ladder.length + 1} times: when new, then
				after {days(data.deck.decks[0].ladder)}, and is retired when the last one is solved.
				A miss starts it over. This is the author's.
			</p>
		{:else}
			<p class="section-note">
				Each number is the days a solved tactic card waits before it comes back.
				With {data.deck.decks[0].ladder.join(", ")}, a card is shown
				{data.deck.decks[0].ladder.length + 1} times and is retired when the last one is
				solved; a miss starts it over.
				Left empty, it is the {data.deck.ancestors.length ? "deck above's" : "default"}:
				{data.deck.parentLadder.join(", ")}.
				{#if holdsDecks}The decks inside take it unless they have their own.{/if}
			</p>
			<FormErrors form={form?.ladderErrors ? { errors: form.ladderErrors } : null} />
			<form method="POST" action="?/tacticLadder" class="rename-form" use:enhance={() => ({ update }) => update({ reset: false })}>
				<input
					name="ladder"
					value={form?.ladder ?? data.deck.tacticLadder?.join(", ") ?? ""}
					placeholder={data.deck.parentLadder.join(", ")}
					autocomplete="off"
				/>
				<button class="std-btn">Save</button>
			</form>
		{/if}
	</section>

	<!-- the danger zone is the one section a marketplace deck also gets:
	     resetting the progress is the studier's, and a deck taken can be
	     removed; deleting a deck stays its owner's -->
	<section class="danger-zone">
		<h3>Danger zone</h3>
		{#if form?.cards != null}
			<p class="status status-approved">
				Reset {form.cards} card{form.cards === 1 ? "" : "s"}.
			</p>
		{/if}
		<div class="danger-actions">
			<!-- the cards under it are new again, so their intro pages come up again -->
			<form
				bind:this={resetForm}
				method="POST"
				action="?/reset"
				use:enhance={() => async ({ result, update }) => {
					if (result.type === "success") forgetIntrosRead(data.deck);
					await update();
				}}
			>
				<button type="button" class="danger-button" onclick={confirmReset}>Reset deck</button>
			</form>
			{#if !data.deck.isMarketplace || isTaken}
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
				<button type="button" class="danger-button" onclick={confirmDelete}>{isTaken ? "Remove deck" : "Delete deck"}</button>
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
	/* the in order / mixed choice, as the profile draws its choices */
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
