<script>
	import Layout from "../../routes/(standard-layout)/my-flashcards/[id=uuid]/+layout@.svelte"
	import Probe from "./deck-layout-probe.svelte"

	// the deck layout with a probe for its page, for its tests
	let { data, onMounted } = $props();
</script>

<Layout {data}><Probe {onMounted} /></Layout>
