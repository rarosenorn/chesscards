<script>
	import CardBrowser from "$lib/components/CardBrowser.svelte"

	let { data } = $props();
</script>

<CardBrowser cards={data.request.cards} />
