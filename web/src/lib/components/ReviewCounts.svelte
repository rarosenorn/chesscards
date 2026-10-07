<script>
	import ThumbUpLine from "$lib/icons/ThumbUpLine.svelte"

	// How a marketplace deck has been reviewed, on its tile and in its header:
	// how many recommend it, by a thumb, and the share of all its reviews that
	// is, "👍 35 (92%)". The header says "None" after its own "Reviews:" label.
	let { reviewCount, recommendCount, none = "No reviews" } = $props();
</script>

{#if reviewCount > 0}
	<span class="counts">
		<span class="thumb"><ThumbUpLine /></span>
		{recommendCount}
		({Math.round(100 * recommendCount / reviewCount)}%)
	</span>
{:else}
	{none}
{/if}

<style>
	.counts {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-variant-numeric: tabular-nums;
		/* in a line of text, the counts on the text's own baseline */
		vertical-align: bottom;
	}
	/* a line drawing in a faded green (the Owned label's): quiet beside the
	   reviews' own filled thumbs */
	.thumb {
		display: inline-flex;
		font-size: 1.2em;
		color: #5a8a2a;
	}
</style>
