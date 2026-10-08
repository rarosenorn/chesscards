<script>
	import { goto } from "$app/navigation"
	import { page } from "$app/state"
	import { deserialize } from "$app/forms"
	import DescriptionEditor from "$lib/components/DescriptionEditor.svelte"
	import SampleCardPicker from "$lib/components/SampleCardPicker.svelte"
	import ThumbnailCrop from "$lib/components/ThumbnailCrop.svelte"
	import { sideHasContent } from "$lib/card-utils.js"

	let { data } = $props();

	// two-step wizard, client-side: real routes would destroy the crop,
	// description editor and selection state on every switch.
	// step 1 = details form, step 2 = choose preview cards + send the request.
	// Everything starts as the deck's own listing (its Deck tab) and is the
	// request's to change: editing it here leaves the deck's listing as it is.
	let step = $state(1);

	// svelte-ignore state_referenced_locally -- starting values only; the user edits them freely
	let name = $state(data.listing.name);
	// svelte-ignore state_referenced_locally
	let theme = $state(data.listing.theme ?? "");
	let price = $state(0);
	// svelte-ignore state_referenced_locally
	let previewIds = $state(data.listing.previewCardIds.filter(id => data.deck.cards.some(card => card.id === id)));
	let descriptionEditor = $state(null);
	let errors = $state([]);
	let submitting = $state(false);

	// the deck's thumbnail unless another image is chosen, which is cropped
	// here; step 1 stays mounted behind step 2, so the crop survives the switch
	let file = $state(null);
	let fileInput = $state(null);
	let cropper = $state(null);
	let deckThumbnail = $derived(
		data.listing.imageVersion && `/my-flashcards/${page.params.id}/thumbnail?v=${data.listing.imageVersion}`
	);

	const handleFileChange = event => {
		const chosen = event.target.files[0];
		event.target.value = "";
		if (chosen) file = chosen;
	}

	// details beyond native form validation; checked before step 2 opens and
	// again on submit
	const readDetails = () => {
		const description = descriptionEditor.read();
		return {
			description: description.blocks,
			errors: [
				...(file || deckThumbnail ? [] : ["A thumbnail image is required"]),
				...description.errors,
				...(sideHasContent(description.blocks) ? [] : ["A description is required"])
			]
		};
	}

	// the details <form>'s submit handler: its native validation has passed
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
			formData.set("theme", theme);
			formData.set("price", price.toString());
			formData.set("description", JSON.stringify(details.description));
			formData.set("previewCardIds", JSON.stringify(previewIds));
			if (file) formData.set("image", await cropper.crop(), "thumbnail.jpg");

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

<div class="details-panel" hidden={step !== 1}>
	<h1>Request upload to marketplace</h1>
	<!-- the fields name this form rather than sit in it: the description's
	     board editor has buttons and inputs of its own, which inside a form
	     would submit it -->
	<form id="request-details" onsubmit={e => { e.preventDefault(); goNext(); }}></form>
	<div class="fields">
		<label for="mp-name">Name</label>
		<input id="mp-name" form="request-details" bind:value={name} required minlength="4" maxlength="100" autocomplete="off" />

		<p class="field-label">Thumbnail image</p>
		<div class="thumbnail-field">
			{#if file}
				<ThumbnailCrop {file} bind:this={cropper} />
			{:else if deckThumbnail}
				<img class="thumbnail" src={deckThumbnail} alt={name} />
			{/if}
			<div class="image-actions">
				<button type="button" class="std-btn" onclick={() => fileInput.click()}>
					{file || deckThumbnail ? "Change image" : "Choose image"}
				</button>
				{#if file && deckThumbnail}
					<button type="button" class="std-btn" onclick={() => file = null}>Keep the deck's</button>
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
		<DescriptionEditor bind:this={descriptionEditor} blocks={data.listing.description} />

		<label for="mp-theme">Theme</label>
		<select id="mp-theme" form="request-details" class="natural-width" bind:value={theme} required>
			<option value="" disabled>Choose a theme</option>
			{#each data.themes as themeOption}
				<option value={themeOption}>{themeOption}</option>
			{/each}
		</select>

		<label for="mp-price">Price</label>
		<input id="mp-price" form="request-details" class="natural-width" type="number" bind:value={price} min="0" max="999.99" step="0.01" required />

		{#if errors.length > 0}
			<ul class="errors">
				{#each errors as error}
					<li>{error}</li>
				{/each}
			</ul>
		{/if}

		<div class="form-actions">
			<a class="std-btn" href="/my-flashcards/{page.params.id}/settings">Cancel</a>
			<button class="std-btn" form="request-details">Next</button>
		</div>
	</div>
</div>
{#if step === 2}
	<SampleCardPicker cards={data.deck.cards} bind:previewIds>
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
					Request upload
				</button>
			</div>
		{/snippet}
	</SampleCardPicker>
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
	.natural-width {
		align-self: start;
		width: auto;
	}
	#mp-price {
		width: 90px;
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
