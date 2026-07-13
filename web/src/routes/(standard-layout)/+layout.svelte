<script>
	import StandardLayout from "$lib/components/StandardLayout.svelte"
	let { children } = $props();
</script>

<StandardLayout>
	{@render children()}
</StandardLayout>
