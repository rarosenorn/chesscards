<script>
	import DescriptionView from "$lib/components/DescriptionView.svelte"

	let { data } = $props();
</script>

<DescriptionView blocks={data.mpDeck.description} />
