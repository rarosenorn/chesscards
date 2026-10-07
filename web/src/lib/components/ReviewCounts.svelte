<script>
	// How a marketplace deck has been reviewed, in a few words that read the
	// same at any number: "35 of 38 recommend". On the deck's tile and in its
	// header, which says "None" after its own "Reviews:" label.
	let { reviewCount, recommendCount, none = "No reviews" } = $props();
</script>

{reviewCount > 0 ? `${recommendCount} of ${reviewCount} recommend` : none}
