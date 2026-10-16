<script>
	import IntroView from "$lib/components/IntroView.svelte"

	// The deck's intro pages as study will show them to whoever takes the
	// deck: its own, then those of the decks inside it. They are published with the cards,
	// so they are reviewed with them.
	let { data } = $props();
</script>

{#each data.request.intros as intro}
	<IntroView crumbs={intro.crumbs} blocks={intro.blocks} />
{:else}
	<p class="empty">No intro pages</p>
{/each}

<style>
	.empty {
		margin: 40px auto;
		text-align: center;
		color: rgba(0, 0, 0, 0.5);
	}
</style>
