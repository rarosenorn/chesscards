<script>
	import { ttGenerateHTML } from "$lib/tiptap-utility.js"

	let { data } = $props();
</script>

<div class="description">
	{@html ttGenerateHTML(data.mpDeck.description)}
</div>

<style>
	.description {
		margin: 16px 0;
		max-width: 70ch;
	}
	.description :global(p) {
		margin: 0 0 12px 0;
	}
</style>
