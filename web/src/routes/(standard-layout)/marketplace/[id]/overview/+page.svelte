<script>
	import DescriptionView from "$lib/components/DescriptionView.svelte"
	import DeckReviews from "$lib/components/DeckReviews.svelte"

	let { data } = $props();
</script>

<DescriptionView blocks={data.mpDeck.description} />
<DeckReviews
	marketplaceDeckId={data.mpDeck.id}
	reviews={data.reviews}
	canReview={data.alreadyOwned && !data.mpDeck.isAuthor}
	isAuthor={data.mpDeck.isAuthor}
/>
