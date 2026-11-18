<script>
	import DescriptionView from "$lib/components/DescriptionView.svelte"
	import DeckContents from "$lib/components/DeckContents.svelte"
	import DeckReviews from "$lib/components/DeckReviews.svelte"

	let { data } = $props();
</script>

<DescriptionView blocks={data.mpDeck.description} />
<DeckContents subdecks={data.contents} />
<DeckReviews
	slug={data.mpDeck.slug}
	reviews={data.reviews}
	canReview={data.ownership.owned && !data.mpDeck.isAuthor}
	isAuthor={data.mpDeck.isAuthor}
	isAdmin={data.isAdmin}
/>
