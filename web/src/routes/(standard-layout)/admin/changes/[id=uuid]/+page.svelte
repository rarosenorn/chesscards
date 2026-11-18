<script>
	import FormErrors from "$lib/components/FormErrors.svelte"
	import DescriptionView from "$lib/components/DescriptionView.svelte"
	import FlashcardBrowse from "$lib/components/FlashcardBrowse.svelte"

	let { data, form } = $props();
	let request = $derived(data.request);
</script>

<p class="crumbs"><a href="/admin">Admin</a> · <a href="/marketplace/{request.slug}">the deck's page</a> · {request.email ?? "author gone"}</p>
<FormErrors {form} />

{#if request.name != null}
	<section>
		<h2>Name</h2>
		<div class="sides">
			<div><h3>Now</h3><p>{request.currentName}</p></div>
			<div><h3>Asked for</h3><p>{request.name}</p></div>
		</div>
	</section>
{/if}

{#if request.hasImage}
	<section>
		<h2>Thumbnail</h2>
		<div class="sides">
			<div><h3>Now</h3><img class="thumbnail" src="/marketplace/{request.slug}/thumbnail" alt="Now" /></div>
			<div><h3>Asked for</h3><img class="thumbnail" src="/admin/changes/{request.id}/thumbnail" alt="Asked for" /></div>
		</div>
	</section>
{/if}

{#if request.description != null}
	<section>
		<h2>Description</h2>
		<h3>Now</h3>
		<div class="framed"><DescriptionView blocks={request.currentDescription} /></div>
		<h3>Asked for</h3>
		<div class="framed"><DescriptionView blocks={request.description} /></div>
	</section>
{/if}

{#if request.previewCards != null}
	<section>
		<h2>Sample cards</h2>
		<h3>Now ({request.currentPreviewCards.length})</h3>
		{#each request.currentPreviewCards as card (card.id)}
			<FlashcardBrowse {card} />
		{:else}
			<p>None</p>
		{/each}
		<h3>Asked for ({request.previewCards.length})</h3>
		{#each request.previewCards as card (card.id)}
			<FlashcardBrowse {card} />
		{:else}
			<p>None</p>
		{/each}
	</section>
{/if}

{#if request.status === "pending"}
	<div class="decide">
		<form method="POST" action="?/approve">
			<button class="std-btn">Approve</button>
		</form>
		<form method="POST" action="?/reject">
			<input name="reason" required placeholder="Reason, shown to the author">
			<button class="std-btn">Reject</button>
		</form>
	</div>
{:else}
	<p>This request was {request.status}.</p>
{/if}

<style>
	.crumbs {
		margin: 0 0 16px 0;
	}
	section {
		margin-bottom: 28px;
	}
	h2 {
		font-size: 1.2rem;
		margin-bottom: 10px;
	}
	h3 {
		font-size: 0.95rem;
		color: rgba(0, 0, 0, 0.6);
		margin: 12px 0 6px 0;
	}
	.sides {
		display: flex;
		flex-wrap: wrap;
		gap: 32px;
	}
	.sides p {
		margin: 0;
	}
	.thumbnail {
		display: block;
		width: 300px;
		aspect-ratio: 3 / 2;
		object-fit: cover;
		border-radius: 4px;
	}
	.framed {
		border: 1px solid rgba(0, 0, 0, 0.1);
		border-radius: 4px;
		padding: 12px;
	}
	.decide, .decide form {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.decide {
		gap: 24px;
	}
	.decide input {
		width: 32ch;
	}
</style>
