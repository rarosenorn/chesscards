<script>
	import FlashcardBrowse from "$lib/components/FlashcardBrowse.svelte"

	let { data } = $props();
</script>

{#if data.previewCards.length === 0}
	<p class="no-preview">No preview cards</p>
{:else}
	{#each data.previewCards as card (card.id)}
		<FlashcardBrowse {card} />
	{/each}
{/if}

<style>
	.no-preview {
		margin-top: 16px;
		color: rgba(0, 0, 0, 0.6);
	}
</style>
