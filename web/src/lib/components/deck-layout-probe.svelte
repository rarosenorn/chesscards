<script>
	import { getContext, onMount } from "svelte"

	// a page under the deck layout, for its tests: says it was mounted, and
	// hands over what the layout keeps for the deck's pages
	let { onMounted } = $props();
	const drafts = getContext("cardDrafts");
	onMount(() => onMounted?.(drafts));
</script>

<p class="probe"></p>
