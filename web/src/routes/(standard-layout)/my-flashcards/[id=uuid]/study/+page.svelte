<script>
	// the deck the layout put in context, with everything inside it
	import Study from "$lib/components/Study.svelte"

	let { data } = $props();
</script>

<Study fsrsParameters={data.fsrsParameters} refitted={data.refitted} desiredRetention={data.desiredRetention} />
