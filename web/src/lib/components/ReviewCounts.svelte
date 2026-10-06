<script>
	import ThumbUp from "$lib/icons/ThumbUp.svelte"
	import ThumbDown from "$lib/icons/ThumbDown.svelte"

	// How many recommend a marketplace deck and how many don't, each by its
	// thumb: on the deck's tile and in its header. 0 and 0 on a deck nobody
	// has reviewed, so it reads the same way everywhere.
	let { reviewCount, recommendCount } = $props();
</script>

<span class="counts">
	<ThumbUp /> {recommendCount}
	<ThumbDown /> {reviewCount - recommendCount}
</span>

<style>
	.counts {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		font-variant-numeric: tabular-nums;
		/* in a line of text, the counts on the text's own baseline */
		vertical-align: bottom;
	}
	.counts :global(svg) {
		font-size: 1.25em;
	}
	.counts :global(svg:last-of-type) {
		margin-left: 4px;
	}
</style>
