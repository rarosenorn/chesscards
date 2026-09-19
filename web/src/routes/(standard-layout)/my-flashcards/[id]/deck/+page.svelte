<script>
	import { deserialize } from "$app/forms"
	import { invalidateAll } from "$app/navigation"
	import StandardLayout from "$lib/components/StandardLayout.svelte"
	import TextEditor from "$lib/components/TextEditor.svelte"
	import ThumbnailCrop from "$lib/components/ThumbnailCrop.svelte"
	import { ttGenerateHTML } from "$lib/tiptap-utility.js"

	let { data } = $props();

	// a marketplace deck instance's listing is its author's: shown, not edited
	let editable = $derived(!data.deck.isMarketplace);

	let thumbnailSrc = $derived(
		editable
			? data.listing.imageVersion && `/my-flashcards/${data.listing.id}/thumbnail?v=${data.listing.imageVersion}`
			: `/marketplace/${data.listing.marketplaceDeckId}/thumbnail`
	);

	// the listing shows as the marketplace would; Edit swaps in the fields,
	// filled from what is saved, and Cancel drops whatever they became
	let editing = $state(false);
	let name = $state("");
	let theme = $state("");
	let descriptionEditor = $state(null);

	// a newly chosen image, shown in the crop box in place of the thumbnail
	// until the save uploads the crop
	let file = $state(null);
	let fileInput = $state(null);
	let cropper = $state(null);

	let errors = $state([]);

	const startEditing = () => {
		name = data.listing.name;
		theme = data.listing.theme ?? "";
		file = null;
		errors = [];
		editing = true;
	}

	const handleFileChange = event => {
		const chosen = event.target.files[0];
		event.target.value = "";
		if (chosen) file = chosen;
	}

	const save = async () => {
		errors = [];
		try {
			const formData = new FormData();
			formData.set("name", name);
			formData.set("theme", theme);
			formData.set("description", JSON.stringify(
				descriptionEditor.isEmpty() ? null : descriptionEditor.getJson()
			));
			if (file) formData.set("image", await cropper.crop(), "thumbnail.jpg");

			const response = await fetch("?/save", {
				method: "POST",
				headers: { "x-sveltekit-action": "true" },
				body: formData
			});
			const result = deserialize(await response.text());
			if (result.type === "success") {
				await invalidateAll();
				file = null;
				editing = false;
			} else {
				errors = result.data?.errors ?? ["Something went wrong. Please try again."];
			}
		} catch (err) {
			console.error(err);
			errors = ["Could not reach the server. Check your connection and try again."];
		}
	}
</script>

<StandardLayout>
	{#snippet headerActions()}
		{#if editable && !editing}
			<button type="button" class="std-btn" onclick={startEditing}>Edit</button>
		{/if}
	{/snippet}

	{#if editing}
		<div class="deck-header">
			<div class="thumbnail-column">
				{#if file}
					<ThumbnailCrop {file} bind:this={cropper} />
				{:else if thumbnailSrc}
					<img class="thumbnail" src={thumbnailSrc} alt={data.listing.name} />
				{:else}
					<div class="thumbnail placeholder">No thumbnail</div>
				{/if}
				<div class="image-actions">
					<button type="button" class="std-btn" onclick={() => fileInput.click()}>
						{file || thumbnailSrc ? "Change image" : "Choose image"}
					</button>
					{#if file}
						<button type="button" class="std-btn" onclick={() => file = null}>Keep current</button>
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
			<div class="deck-side">
				<input class="name-input" aria-label="Name" bind:value={name} maxlength="100" autocomplete="off" />
				<div class="deck-info">
					<p><span>Author:</span> {data.listing.author}</p>
					<p>
						<label for="deck-theme">Theme:</label>
						<select id="deck-theme" bind:value={theme}>
							<option value="">No theme</option>
							{#each data.themes as themeOption}
								<option value={themeOption}>{themeOption}</option>
							{/each}
						</select>
					</p>
					<p><span>No. of cards:</span> {data.listing.cardCount}</p>
				</div>
			</div>
		</div>

		<p class="field-label">Description</p>
		<TextEditor bind:this={descriptionEditor} content={data.listing.description ?? ""} />

		{#if errors.length > 0}
			<ul class="errors">
				{#each errors as error}
					<li>{error}</li>
				{/each}
			</ul>
		{/if}
		<div class="save-row">
			<button type="button" class="std-btn" onclick={() => editing = false}>Cancel</button>
			<button type="button" class="std-btn" onclick={save}>Save</button>
		</div>
	{:else}
		<div class="deck-header">
			{#if thumbnailSrc}
				<img class="thumbnail" src={thumbnailSrc} alt={data.listing.name} />
			{:else}
				<div class="thumbnail placeholder">No thumbnail</div>
			{/if}
			<div class="deck-side">
				<h2>{data.listing.name}</h2>
				<div class="deck-info">
					<p><span>Author:</span> {data.listing.author}</p>
					<p class="theme"><span>Theme:</span> {data.listing.theme ?? "none"}</p>
					<p><span>No. of cards:</span> {data.listing.cardCount}</p>
				</div>
			</div>
		</div>
		{#if data.listing.description}
			<div class="description">
				{@html ttGenerateHTML(data.listing.description)}
			</div>
		{:else}
			<p class="description empty">No description</p>
		{/if}
	{/if}
</StandardLayout>

<style>
	/* the marketplace deck page's header, so the tab reads as the listing */
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
	.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: #eff1f3;
		color: rgba(0, 0, 0, 0.5);
	}
	.image-actions {
		display: flex;
		justify-content: center;
		gap: 8px;
		margin-top: 8px;
	}
	h2 {
		font-size: 1.3rem;
	}
	.name-input {
		font-size: 1.3rem;
		font-weight: 600;
		width: 360px;
		border: 1px solid rgba(0, 0, 0, 0.25);
		border-radius: 4px;
		padding: 4px 8px;
	}
	.deck-info {
		margin-top: 8px;
		color: rgba(0, 0, 0, 0.6);
	}
	.theme {
		text-transform: capitalize;
	}
	.deck-info p {
		margin: 0 0 6px 0;
	}
	.deck-info span,
	.deck-info label {
		font-weight: 600;
	}
	.description {
		margin: 24px 0 16px 0;
		max-width: 70ch;
	}
	.description :global(p) {
		margin: 0 0 12px 0;
	}
	.field-label {
		margin: 24px 0 6px 0;
		font-weight: 500;
	}
	.errors {
		color: red;
		padding-left: 16px;
		margin: 12px 0 0 0;
	}
	.save-row {
		display: flex;
		justify-content: end;
		align-items: center;
		gap: 8px;
		margin-top: 16px;
	}
	.empty {
		color: rgba(0, 0, 0, 0.5);
	}
</style>
