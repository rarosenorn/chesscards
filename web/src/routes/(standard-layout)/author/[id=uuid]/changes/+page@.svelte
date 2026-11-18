<script>
	import { goto } from "$app/navigation"
	import { page } from "$app/state"
	import { deserialize } from "$app/forms"
	import DescriptionEditor from "$lib/components/DescriptionEditor.svelte"
	import SampleCardPicker from "$lib/components/SampleCardPicker.svelte"
	import ThumbnailCrop from "$lib/components/ThumbnailCrop.svelte"
	import { sideHasContent } from "$lib/card-utils.js"

	let { data } = $props();

	// As Request upload: two steps on one page, so the crop, the description
	// editor and the chosen cards survive the switch. Everything starts as the
	// deck's page shows it, or as the changes waiting for review have it.
	let step = $state(1);

	// svelte-ignore state_referenced_locally -- starting values only
	let name = $state(data.pending?.name ?? data.deck.name);
	// svelte-ignore state_referenced_locally
	let previewIds = $state(data.pending?.previewCardIds ?? data.deck.previewCardIds);
	// svelte-ignore state_referenced_locally
	const startDescription = data.pending?.description ?? data.deck.description;
	let descriptionEditor = $state(null);
	let errors = $state([]);
	let submitting = $state(false);

	// the thumbnail: a new image chosen here (cropped), else the one the
	// changes waiting ask for, else the deck's own
	let file = $state(null);
	// svelte-ignore state_referenced_locally
	let keepPending = $state(Boolean(data.pending?.hasImage));
	let fileInput = $state(null);
	let cropper = $state(null);
	let shown = $derived(keepPending
		? `/author/${page.params.id}/changes/thumbnail?v=${Date.parse(data.pending.createdAt)}`
		: `/marketplace/${data.deck.slug}/thumbnail`);
	let changed = $derived(Boolean(file) || keepPending);

	const handleFileChange = event => {
		const chosen = event.target.files[0];
		event.target.value = "";
		if (chosen) file = chosen;
	}

	const keepCurrent = () => {
		file = null;
		keepPending = false;
	}

	const readDetails = () => {
		const description = descriptionEditor.read();
		return {
			description: description.blocks,
			errors: [
				...description.errors,
				...(sideHasContent(description.blocks) ? [] : ["A description is required"])
			]
		};
	}

	const goNext = () => {
		errors = readDetails().errors;
		if (errors.length === 0) step = 2;
	}

	const submit = async () => {
		const details = readDetails();
		errors = details.errors;
		if (errors.length > 0) return;
		submitting = true;
		try {
			const formData = new FormData();
			formData.set("name", name);
			formData.set("description", JSON.stringify(details.description));
			formData.set("previewCardIds", JSON.stringify(previewIds));
			if (file) formData.set("image", await cropper.crop(), "thumbnail.jpg");
			else if (keepPending) formData.set("keepPendingImage", "true");

			const response = await fetch("?/requestChanges", {
				method: "POST",
				headers: { "x-sveltekit-action": "true" },
				body: formData
			});
			const result = deserialize(await response.text());
			if (result.type === "success") {
				await goto("/author", { invalidateAll: true });
			} else {
				errors = result.data?.errors ?? ["Something went wrong. Please try again."];
			}
		} catch (err) {
			console.error(err);
			errors = ["Could not reach the server. Check your connection and try again."];
		} finally {
			submitting = false;
		}
	}
</script>

<div class="request-nav-container">
	<div class="breadcrumbs">
		<a href="/author">Your marketplace decks</a>
		<span>{"->"}</span>
		<span>{data.deck.name}</span>
		<span>{"->"}</span>
		<span>Request changes</span>
	</div>
	<div class="steps">
		<button class="step" class:active={step === 1} onclick={() => step = 1}>
			1. Details
		</button>
		<span class="step-arrow">{"->"}</span>
		<button class="step" class:active={step === 2} onclick={() => { if (step === 1) goNext(); }}>
			2. Sample cards ({previewIds.length})
		</button>
	</div>
</div>

<div class="details-panel" hidden={step !== 1}>
	<h1>Request changes</h1>
	<p class="intro">
		Changes show on the deck's page once Chesscards has reviewed them.
		{#if data.pending}Asking again replaces the changes waiting for review.{/if}
	</p>
	<form id="change-details" onsubmit={e => { e.preventDefault(); goNext(); }}></form>
	<div class="fields">
		<label for="mp-name">Name</label>
		<input id="mp-name" form="change-details" bind:value={name} required minlength="4" maxlength="100" autocomplete="off" />

		<p class="field-label">Thumbnail image</p>
		<div class="thumbnail-field">
			{#if file}
				<ThumbnailCrop {file} bind:this={cropper} />
			{:else}
				<img class="thumbnail" src={shown} alt={name} />
			{/if}
			<div class="image-actions">
				<button type="button" class="std-btn" onclick={() => fileInput.click()}>Change image</button>
				{#if changed}
					<button type="button" class="std-btn" onclick={keepCurrent}>Keep the current one</button>
				{/if}
			</div>
			<input
				bind:this={fileInput}
				type="file"
				accept="image/jpeg,image/png,image/webp"
				hidden
				onchange={handleFileChange}
			/>
		</div>

		<p class="field-label">Description</p>
		<DescriptionEditor bind:this={descriptionEditor} blocks={startDescription} />

		{#if errors.length > 0}
			<ul class="errors">
				{#each errors as error}
					<li>{error}</li>
				{/each}
			</ul>
		{/if}

		<div class="form-actions">
			<a class="std-btn" href="/author">Cancel</a>
			<button class="std-btn" form="change-details">Next</button>
		</div>
	</div>
</div>
{#if step === 2}
	<SampleCardPicker cards={data.cards} bind:previewIds>
		{#snippet footer()}
			{#if errors.length > 0}
				<ul class="errors footer-errors">
					{#each errors as error}
						<li>{error}</li>
					{/each}
				</ul>
			{/if}
			<div class="footer-buttons">
				<button type="button" class="std-btn" onclick={() => step = 1}>Back</button>
				<button type="button" class="std-btn request-btn" disabled={submitting} onclick={submit}>
					Send for review
				</button>
			</div>
		{/snippet}
	</SampleCardPicker>
{/if}

<style>
	/* as Request upload's */
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
		margin-bottom: 8px;
	}
	.intro {
		margin: 0 0 12px 0;
		font-size: 0.9rem;
		color: rgba(0, 0, 0, 0.6);
	}
	.fields {
		display: flex;
		flex-direction: column;
		gap: 6px;
		max-width: 720px;
	}
	label, .field-label {
		margin-top: 8px;
		margin-bottom: 0;
		font-weight: 500;
	}
	.thumbnail-field {
		align-self: center;
	}
	.thumbnail {
		display: block;
		width: 300px;
		aspect-ratio: 3 / 2;
		object-fit: cover;
		border-radius: 4px;
	}
	.image-actions {
		display: flex;
		justify-content: center;
		gap: 8px;
		margin-top: 8px;
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
	.footer-errors {
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
</style>
