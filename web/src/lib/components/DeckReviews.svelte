<script>
	import { deserialize } from "$app/forms"
	import { goto, invalidateAll } from "$app/navigation"
	import ThumbUp from "$lib/icons/ThumbUp.svelte"
	import ThumbDown from "$lib/icons/ThumbDown.svelte"

	// A marketplace deck's reviews, under its description on the marketplace
	// page and on the Deck tab of whoever has the deck. canReview: the viewer
	// has the deck and did not write it. isAuthor: they wrote it, and answer
	// its reviews instead.
	let { marketplaceDeckId, reviews, canReview = false, isAuthor = false } = $props();

	// the viewer's own review leads the list, whatever the order of the rest
	let myReview = $derived(reviews.find(review => review.mine));

	// the reviews arrive most helpful first
	let sort = $state("helpful");
	let others = $derived.by(() => {
		const rest = reviews.filter(review => !review.mine);
		return sort === "newest"
			? [...rest].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
			: rest;
	});

	// the review form: there for a first review, and on Edit for a posted one
	let editing = $state(false);
	let recommended = $state(null);
	let body = $state("");
	let errors = $state([]);

	// the author's reply, written under one review at a time
	let respondingTo = $state(null);
	let response = $state("");
	let responseErrors = $state([]);

	let voteErrors = $state([]);

	// The actions are the marketplace deck page's; the Deck tab shows the same
	// reviews, so both post there by fetch. Resolves to the errors, none when
	// it went through.
	const post = async (action, fields) => {
		const formData = new FormData();
		for (const [key, value] of Object.entries(fields)) formData.set(key, value);
		try {
			const res = await fetch(`/marketplace/${marketplaceDeckId}/overview?/${action}`, {
				method: "POST",
				headers: { "x-sveltekit-action": "true" },
				body: formData
			});
			const result = deserialize(await res.text());
			if (result.type === "success") {
				await invalidateAll();
				return [];
			}
			// logged out: the action sends you to log in
			if (result.type === "redirect") {
				await goto(result.location);
				return [];
			}
			return result.data?.errors ?? ["Something went wrong. Please try again."];
		} catch (err) {
			console.error(err);
			return ["Could not reach the server. Check your connection and try again."];
		}
	}

	const startEditing = () => {
		recommended = myReview.recommended;
		body = myReview.body;
		errors = [];
		editing = true;
	}

	const saveReview = async () => {
		errors = await post("saveReview", { recommended: recommended ?? "", body });
		if (errors.length === 0) editing = false;
	}

	// the form stays as it was, now a first review's: posting it again is the
	// way back
	const deleteReview = async () => {
		errors = await post("deleteReview", {});
		if (errors.length === 0) editing = false;
	}

	// a second click on the arrow you chose takes the vote back
	const vote = async (review, value) => {
		voteErrors = await post("vote", { reviewId: review.id, value: review.myVote === value ? 0 : value });
	}

	const startResponding = review => {
		response = review.authorResponse ?? "";
		responseErrors = [];
		respondingTo = review.id;
	}

	// saved empty, the response is taken down
	const saveResponse = async () => {
		responseErrors = await post("respond", { reviewId: respondingTo, response });
		if (responseErrors.length === 0) respondingTo = null;
	}

	const dateOf = date => new Date(date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

	// a text area as tall as its text: the page scrolls, not the box
	const autoGrow = node => {
		const fit = () => {
			node.style.height = "auto";
			node.style.height = `${node.scrollHeight + node.offsetHeight - node.clientHeight}px`;
		}
		fit();
		node.addEventListener("input", fit);
		return { destroy: () => node.removeEventListener("input", fit) };
	}
</script>

{#snippet errorList(list)}
	{#if list.length > 0}
		<ul class="errors">
			{#each list as error}
				<li>{error}</li>
			{/each}
		</ul>
	{/if}
{/snippet}

{#snippet reviewRow(review)}
	<article class="review">
		<div class="review-head">
			<span class="verdict">
				<span class="thumb" class:up={review.recommended} class:down={!review.recommended}>
					{#if review.recommended}<ThumbUp />{:else}<ThumbDown />{/if}
				</span>
				{review.recommended ? "Recommended" : "Not recommended"}
			</span>
			<span class="review-meta">
				{review.mine ? "Your review" : review.author}
				· {review.cardsStudied} {review.cardsStudied === 1 ? "card" : "cards"} studied
				· {dateOf(review.createdAt)}{review.edited ? " (edited)" : ""}
			</span>
		</div>
		<p class="review-body">{review.body}</p>
		<div class="review-foot">
			{#if review.mine}
				<span class="helpful">Helpful: <span class="score">{review.score}</span></span>
				{#if canReview}
					<button type="button" class="link-btn" onclick={startEditing}>Edit</button>
				{/if}
			{:else}
				<span class="helpful">
					Helpful?
					<button
						type="button"
						class="vote up"
						class:active={review.myVote === 1}
						aria-label="Helpful"
						aria-pressed={review.myVote === 1}
						onclick={() => vote(review, 1)}
					><ThumbUp /></button>
					<span class="score">{review.score}</span>
					<button
						type="button"
						class="vote down"
						class:active={review.myVote === -1}
						aria-label="Not helpful"
						aria-pressed={review.myVote === -1}
						onclick={() => vote(review, -1)}
					><ThumbDown /></button>
				</span>
				{#if isAuthor && respondingTo !== review.id}
					<button type="button" class="link-btn" onclick={() => startResponding(review)}>
						{review.authorResponse ? "Edit response" : "Respond"}
					</button>
				{/if}
			{/if}
		</div>
		{#if respondingTo === review.id}
			<div class="response-form">
				<textarea
					use:autoGrow
					bind:value={response}
					aria-label="Your response"
					placeholder="Your response, as the deck's author"
					maxlength="5000"
				></textarea>
				{@render errorList(responseErrors)}
				<div class="form-actions">
					<button type="button" class="std-btn" onclick={() => respondingTo = null}>Cancel</button>
					<button type="button" class="std-btn" onclick={saveResponse}>Save</button>
				</div>
			</div>
		{:else if review.authorResponse}
			<div class="author-response">
				<p class="response-label">Author's response · {dateOf(review.authorResponseAt)}</p>
				<p class="review-body">{review.authorResponse}</p>
			</div>
		{/if}
	</article>
{/snippet}

<section class="reviews" id="reviews">
	<div class="reviews-heading">
		<h3>Reviews</h3>
		{#if others.length > 1}
			<div class="sort">
				<button type="button" class:active={sort === "helpful"} onclick={() => sort = "helpful"}>Most helpful</button>
				<button type="button" class:active={sort === "newest"} onclick={() => sort = "newest"}>Newest</button>
			</div>
		{/if}
	</div>

	{#if canReview && (!myReview || editing)}
		<div class="review-form">
			<div class="verdict-choice">
				<button
					type="button"
					class="std-btn"
					class:chosen={recommended === true}
					aria-pressed={recommended === true}
					onclick={() => recommended = true}
				>
					<span class="thumb up"><ThumbUp /></span> Recommend
				</button>
				<button
					type="button"
					class="std-btn"
					class:chosen={recommended === false}
					aria-pressed={recommended === false}
					onclick={() => recommended = false}
				>
					<span class="thumb down"><ThumbDown /></span> Don't recommend
				</button>
			</div>
			<textarea
				use:autoGrow
				bind:value={body}
				aria-label="Your review"
				placeholder="What makes you say so?"
				maxlength="5000"
			></textarea>
			{@render errorList(errors)}
			<div class="form-actions">
				{#if editing}
					<button type="button" class="std-btn" onclick={deleteReview}>Delete</button>
					<button type="button" class="std-btn" onclick={() => editing = false}>Cancel</button>
				{/if}
				<button type="button" class="std-btn" onclick={saveReview}>{editing ? "Save" : "Post review"}</button>
			</div>
		</div>
	{:else if myReview}
		{@render reviewRow(myReview)}
	{/if}

	{@render errorList(voteErrors)}
	{#each others as review (review.id)}
		{@render reviewRow(review)}
	{/each}

	{#if reviews.length === 0 && !canReview}
		<p class="empty">No reviews yet</p>
	{/if}
</section>

<style>
	.reviews {
		margin-top: 32px;
		/* the header's Reviews line jumps here; clear of the window's top edge */
		scroll-margin-top: 16px;
	}
	.reviews-heading {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		padding-bottom: 8px;
		border-bottom: 1px solid #e3e1e1;
	}
	h3 {
		font-size: 1.1rem;
	}
	.sort {
		display: flex;
		gap: 4px;
	}
	.sort button {
		border: none;
		background: none;
		cursor: pointer;
		padding: 2px 6px;
		border-radius: 4px;
		color: rgba(0, 0, 0, 0.6);
	}
	.sort button:hover {
		color: black;
		background-color: rgba(0, 0, 0, 0.05);
	}
	.sort button.active {
		color: black;
		font-weight: 600;
	}
	.review,
	.review-form {
		padding: 16px 0;
		border-bottom: 1px solid #eee;
	}
	.review-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 12px;
	}
	.verdict {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-weight: 600;
	}
	/* the one place the reviews take a color: the thumbs themselves, the
	   review's verdict and the helpful votes on it */
	.thumb {
		display: inline-flex;
		font-size: 1.15rem;
	}
	.thumb.up,
	.vote.up {
		color: #3a8f4d;
	}
	.thumb.down,
	.vote.down {
		color: #c0453b;
	}
	.review-meta,
	.review-foot,
	.response-label {
		font-size: 0.9rem;
		color: rgba(0, 0, 0, 0.55);
	}
	.review-body {
		margin-top: 8px;
		max-width: 80ch;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.review-foot {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-top: 10px;
	}
	.helpful {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.score {
		min-width: 1.5ch;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}
	.vote {
		display: inline-flex;
		border: none;
		background: none;
		cursor: pointer;
		padding: 3px;
		border-radius: 4px;
		font-size: 1.05rem;
	}
	.vote:hover {
		background-color: rgba(0, 0, 0, 0.06);
	}
	/* your vote: the thumb sits on a grey chip */
	.vote.active {
		background-color: rgba(0, 0, 0, 0.13);
	}
	.link-btn {
		border: none;
		background: none;
		padding: 0;
		cursor: pointer;
		color: inherit;
		text-decoration: underline;
	}
	.link-btn:hover {
		color: black;
	}
	.author-response,
	.response-form {
		margin: 12px 0 0 24px;
	}
	.author-response {
		padding-left: 12px;
		border-left: 2px solid #e3e1e1;
	}
	.response-label {
		font-weight: 600;
	}
	.review-form,
	.response-form {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: 10px;
	}
	.verdict-choice,
	.form-actions {
		display: flex;
		gap: 8px;
	}
	.verdict-choice .std-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.verdict-choice .std-btn.chosen {
		border-color: darkgrey;
		background-color: #e2e2e2;
		font-weight: 600;
	}
	textarea {
		width: 100%;
		max-width: 80ch;
		min-height: 5lh;
		padding: 8px;
		border: 1px solid rgba(0, 0, 0, 0.25);
		border-radius: 4px;
		resize: none;
		overflow: hidden;
	}
	.errors {
		color: red;
		padding-left: 16px;
	}
	.empty {
		margin: 16px 0;
		color: rgba(0, 0, 0, 0.5);
	}
</style>
