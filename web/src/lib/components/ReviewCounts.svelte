<script>
	import ThumbUpLine from "$lib/icons/ThumbUpLine.svelte"
	import ThumbDownLine from "$lib/icons/ThumbDownLine.svelte"

	// How many recommend a marketplace deck and how many don't, each by its
	// thumb: on the deck's tile and in its header. 0 and 0 on a deck nobody
	// has reviewed, so it reads the same way everywhere.
	let { reviewCount, recommendCount } = $props();
</script>

<span class="counts">
	<span class="thumb up"><ThumbUpLine /></span> {recommendCount}
	<span class="thumb down"><ThumbDownLine /></span> {reviewCount - recommendCount}
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
	/* Quiet beside the reviews' own filled thumbs: line drawings, the one for
	   recommending in a faded green (the Owned label's) and the other grey. */
	.thumb {
		display: inline-flex;
		font-size: 1.2em;
	}
	.thumb.up {
		color: #5a8a2a;
	}
	.thumb.down {
		margin-left: 5px;
		color: rgba(0, 0, 0, 0.45);
	}
</style>
