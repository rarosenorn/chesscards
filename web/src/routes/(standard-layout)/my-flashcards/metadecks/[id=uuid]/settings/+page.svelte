<script>
	import { enhance } from "$app/forms"
	import StandardLayout from "$lib/components/StandardLayout.svelte"
	import FormErrors from "$lib/components/FormErrors.svelte"

	let { data, form } = $props();

	const orders = [
		{ value: "mix", label: "Mix" },
		{ value: "in-order", label: "In order" }
	];
</script>

<StandardLayout>
	<section>
		<h3>Metadeck name</h3>
		<FormErrors form={form} />
		<form method="POST" action="?/rename" class="rename-form" use:enhance>
			<input
				name="name"
				value={form?.name ?? data.deck.name}
				required
				minlength="4"
				maxlength="100"
				autocomplete="off"
			/>
			<button class="std-btn">Rename</button>
		</form>
	</section>

	<section>
		<h3>Study order</h3>
		<p class="section-note">
			Mix studies its decks as one deck: reviews shuffled together, new
			cards taken from each deck in turn. In order finishes what one deck
			has waiting before the next, in the order they stand in My
			flashcards.
		</p>
		<form method="POST" action="?/order" use:enhance onchange={e => e.currentTarget.requestSubmit()}>
			<div class="pills">
				{#each orders as option}
					<label class="pill" class:selected={data.deck.studyOrder === option.value}>
						<input type="radio" name="value" value={option.value} checked={data.deck.studyOrder === option.value} />
						{option.label}
					</label>
				{/each}
			</div>
		</form>
	</section>

	<section>
		<h3>Delete metadeck</h3>
		<p class="section-note">Only the grouping goes. Its decks and their progress stay.</p>
		<form method="POST" action="?/delete" use:enhance>
			<button class="danger-button">Delete metadeck</button>
		</form>
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
