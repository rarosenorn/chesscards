<script>
	import { deserialize } from "$app/forms"
	import { goto, invalidateAll } from "$app/navigation"
	import { tick } from "svelte"
	import { confirmModal } from "$lib/modals.svelte.js"
	import ThumbUp from "$lib/icons/ThumbUp.svelte"
	import ThumbDown from "$lib/icons/ThumbDown.svelte"
	import ArrowUp from "$lib/icons/ArrowUp.svelte"
	import ArrowDown from "$lib/icons/ArrowDown.svelte"

	// A marketplace deck's reviews, under its description on the marketplace
	// page and on the Deck tab of whoever has the deck. canReview: the viewer
	// has the deck and did not write it. isAuthor: they wrote it, and answer
	// its reviews instead. isAdmin: they moderate, and can take down what
	// others wrote.
	let { slug, reviews, canReview = false, isAuthor = false, isAdmin = false } = $props();

	// the viewer's own review leads the list, whatever the order of the rest
	let myReview = $derived(reviews.find(review => review.mine));

	// Your review can be rewritten for five minutes after it is posted; the
	// server says how long is left (editableMs). Then it is locked and Edit
	// goes, here on the page as well, without a reload.
	let windowClosed = $state(false);
	$effect(() => {
		const left = myReview?.editableMs ?? 0;
		windowClosed = false;
		if (left <= 0) return;
		const timer = setTimeout(() => windowClosed = true, left);
		return () => clearTimeout(timer);
	});
	let canEdit = $derived(canReview && (myReview?.editableMs ?? 0) > 0 && !windowClosed);

	let recommendCount = $derived(reviews.filter(review => review.recommended).length);

	// Only the reviews that recommend the deck, or only those that don't: a
	// click on that half of the overview line, and another to see all again.
	let only = $state(null);
	const showOnly = verdict => {
		only = only === verdict ? null : verdict;
	}
	const shown = review => only === null || review.recommended === only;

	// By helpfulness or by date, most helpful and newest first; a second click
	// on the one in use turns it round.
	let sort = $state({ by: "helpful", descending: true });
	const sortBy = by => {
		sort = { by, descending: sort.by === by ? !sort.descending : true };
	}
	const arrow = by => sort.by === by ? (sort.descending ? " ↓" : " ↑") : "";

	let others = $derived.by(() => {
		const newest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);
		const net = review => review.helpful - review.unhelpful;
		const sorted = reviews
			.filter(review => !review.mine && shown(review))
			.sort(sort.by === "date" ? newest : (a, b) => net(b) - net(a) || newest(a, b));
		return sort.descending ? sorted : sorted.reverse();
	});

	// The review form: there for a first review, and on Edit for one posted
	// within the last five minutes.
	// It is only its two verdict buttons until one is chosen; the text and
	// Post come with the choice, and go again if it is taken back.
	let editing = $state(false);
	let recommended = $state(null);
	let body = $state("");
	let bodyField = $state(null);
	let errors = $state([]);

	const choose = async verdict => {
		const opening = recommended === null;
		recommended = recommended === verdict ? null : verdict;
		if (opening) {
			await tick();
			bodyField?.focus();
		}
	}

	// the author's reply, written under one review at a time
	let respondingTo = $state(null);
	let response = $state("");
	let responseErrors = $state([]);

	// from what is done on a review's own row: a vote, a delete
	let rowErrors = $state([]);

	// The actions are the marketplace deck page's; the Deck tab shows the same
	// reviews, so both post there by fetch. Resolves to the errors, none when
	// it went through.
	const post = async (action, fields) => {
		const formData = new FormData();
		for (const [key, value] of Object.entries(fields)) formData.set(key, value);
		try {
			const res = await fetch(`/marketplace/${slug}/overview?/${action}`, {
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

	// the form comes back holding what was deleted: posting it again is the
	// way back
	const deleteReview = async () => {
		recommended = myReview.recommended;
		body = myReview.body;
		errors = [];
		rowErrors = await post("deleteReview", {});
	}

	// a second click on the arrow you chose takes the vote back
	const vote = async (review, value) => {
		rowErrors = await post("vote", { reviewId: review.id, value: review.myVote === value ? 0 : value });
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

	const deleteResponse = async review => {
		rowErrors = await post("respond", { reviewId: review.id, response: "" });
	}

	// Moderation. Asked about first, unlike your own deletes: it is someone
	// else's writing, and there is no posting it again.
	const removeReview = async review => {
		const confirmed = await confirmModal({
			title: "Remove review",
			message: `This permanently removes ${review.author}'s review, with its votes and the author's response.`,
			confirmLabel: "Remove",
			danger: true
		});
		if (confirmed) rowErrors = await post("removeReview", { reviewId: review.id });
	}

	const removeResponse = async review => {
		const confirmed = await confirmModal({
			title: "Remove response",
			message: `This permanently removes the author's response to ${review.author}'s review.`,
			confirmLabel: "Remove",
			danger: true
		});
		if (confirmed) rowErrors = await post("removeResponse", { reviewId: review.id });
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
			<span class="thumb-box" class:up={review.recommended} class:down={!review.recommended}>
				{#if review.recommended}<ThumbUp />{:else}<ThumbDown />{/if}
			</span>
			<div>
				<p class="verdict">
					<strong>{review.recommended ? "Recommended" : "Not recommended"}</strong>
					by {review.mine ? "you" : review.author}
				</p>
				<p class="review-meta">
					{review.cardsStudied} {review.cardsStudied === 1 ? "card" : "cards"} studied
					· {dateOf(review.createdAt)}
				</p>
			</div>
		</div>
		<p class="review-body">{review.body}</p>
		<div class="review-foot">
			<!-- your own review is not yours to vote on, nor are the reviews
			     of a deck you wrote -->
			{#if review.mine || isAuthor}
				<span class="helpful">
					Helpful:
					<span class="vote up"><ArrowUp /> {review.helpful}</span>
					<span class="vote down"><ArrowDown /> {review.unhelpful}</span>
				</span>
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
					><ArrowUp /> {review.helpful}</button>
					<button
						type="button"
						class="vote down"
						class:active={review.myVote === -1}
						aria-label="Not helpful"
						aria-pressed={review.myVote === -1}
						onclick={() => vote(review, -1)}
					><ArrowDown /> {review.unhelpful}</button>
				</span>
			{/if}
			{#if review.mine}
				{#if canEdit}
					<button type="button" class="link-btn" onclick={startEditing}>Edit</button>
				{/if}
				{#if canReview}
					<button type="button" class="link-btn" onclick={deleteReview}>Delete</button>
				{/if}
			{:else}
				{#if isAuthor && !review.authorResponse && respondingTo !== review.id}
					<button type="button" class="link-btn" onclick={() => startResponding(review)}>Respond</button>
				{/if}
				{#if isAdmin}
					<button type="button" class="link-btn" onclick={() => removeReview(review)}>Remove</button>
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
				{#if isAuthor}
					<div class="review-foot">
						<button type="button" class="link-btn" onclick={() => startResponding(review)}>Edit</button>
						<button type="button" class="link-btn" onclick={() => deleteResponse(review)}>Delete</button>
					</div>
				{:else if isAdmin}
					<div class="review-foot">
						<button type="button" class="link-btn" onclick={() => removeResponse(review)}>Remove</button>
					</div>
				{/if}
			</div>
		{/if}
	</article>
{/snippet}

<section class="reviews" id="reviews">
	<div class="reviews-heading">
		<h3>Reviews</h3>
		{#if reviews.length > 0}
			<p class="overview">
				<button type="button" class:active={only === true} aria-pressed={only === true} onclick={() => showOnly(true)}>
					Recommended by {recommendCount}
				</button>
				·
				<button type="button" class:active={only === false} aria-pressed={only === false} onclick={() => showOnly(false)}>
					Not recommended by {reviews.length - recommendCount}
				</button>
			</p>
		{/if}
		{#if reviews.length - (myReview ? 1 : 0) > 1}
			<div class="sort">
				<button type="button" class:active={sort.by === "helpful"} onclick={() => sortBy("helpful")}>Helpful{arrow("helpful")}</button>
				<button type="button" class:active={sort.by === "date"} onclick={() => sortBy("date")}>Date{arrow("date")}</button>
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
					onclick={() => choose(true)}
				>
					<span class="thumb"><ThumbUp /></span> Recommend
				</button>
				<button
					type="button"
					class="std-btn"
					class:chosen={recommended === false}
					aria-pressed={recommended === false}
					onclick={() => choose(false)}
				>
					<span class="thumb"><ThumbDown /></span> Don't recommend
				</button>
			</div>
			{#if recommended !== null}
				<label class="prompt" for="review-body">
					Please describe why you recommend or don't recommend this deck
				</label>
				<textarea
					use:autoGrow
					bind:this={bodyField}
					bind:value={body}
					id="review-body"
					maxlength="5000"
				></textarea>
				{@render errorList(errors)}
			{/if}
			{#if recommended !== null || editing}
				<div class="form-actions">
					{#if editing}
						<button type="button" class="std-btn" onclick={() => editing = false}>Cancel</button>
					{/if}
					{#if recommended !== null}
						<button type="button" class="std-btn" onclick={saveReview}>{editing ? "Save" : "Post"}</button>
					{/if}
				</div>
			{/if}
		</div>
	{:else if myReview && shown(myReview)}
		{@render reviewRow(myReview)}
	{/if}

	{@render errorList(rowErrors)}
	{#each others as review (review.id)}
		{@render reviewRow(review)}
	{/each}

	{#if reviews.length === 0 && !canReview}
		<p class="empty">No reviews yet</p>
	{:else if only !== null && !reviews.some(shown)}
		<p class="empty">None</p>
	{/if}
</section>

<style>
	.reviews {
		margin-top: 25px;
	}
	/* A card of their own, under the description's, as Chessable has it: a
	   strip of the page's grey (body, app.css) right across the white card
	   this sits in, out through its 25px padding (StandardLayout). */
	.reviews::before {
		content: "";
		display: block;
		height: 16px;
		margin: 0 -25px 25px;
		background-color: #efefef;
	}
	.reviews-heading {
		display: flex;
		align-items: baseline;
		gap: 16px;
		padding-bottom: 8px;
		border-bottom: 1px solid #e3e1e1;
	}
	h3 {
		font-size: 1.1rem;
	}
	.overview,
	.sort {
		font-size: 0.9rem;
	}
	.overview {
		color: rgba(0, 0, 0, 0.6);
	}
	.sort {
		display: flex;
		gap: 4px;
		margin-left: auto;
	}
	/* the heading row's text buttons: the two halves of the overview, which
	   filter, and the sorts */
	.overview button,
	.sort button {
		border: none;
		background: none;
		cursor: pointer;
		padding: 2px 6px;
		border-radius: 4px;
		color: rgba(0, 0, 0, 0.6);
	}
	.overview button {
		padding: 2px 4px;
	}
	.overview button:hover,
	.sort button:hover {
		color: black;
		background-color: rgba(0, 0, 0, 0.05);
	}
	.overview button.active,
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
		align-items: center;
		gap: 12px;
	}
	/* The one place the reviews take a color: the thumbs, which bring their
	   own (ThumbUp, ThumbDown). The verdict's stands in a square of its
	   color, pale so that the filled thumb still shows on it. */
	.thumb-box {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		border-radius: 4px;
		font-size: 1.75rem;
		flex-shrink: 0;
	}
	.thumb-box.up {
		background-color: #dcedb9;
	}
	.thumb-box.down {
		background-color: #f9cfca;
	}
	.thumb {
		display: inline-flex;
		font-size: 1.3rem;
	}
	.verdict {
		font-size: 1.05rem;
		line-height: 1.3;
	}
	.review-meta,
	.review-foot,
	.response-label {
		font-size: 0.9rem;
		color: rgba(0, 0, 0, 0.55);
	}
	.review-body {
		margin-top: 12px;
		max-width: 80ch;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.review-foot {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-top: 12px;
	}
	.helpful {
		display: inline-flex;
		align-items: center;
		gap: 2px;
	}
	/* Reddit's arrows, each with how many chose it: buttons on someone else's
	   review, the bare counts on your own. Grey; the one that is your vote is
	   black, its arrow filled. */
	.vote {
		display: inline-flex;
		align-items: center;
		gap: 1px;
		border: none;
		background: none;
		padding: 2px 4px 2px 2px;
		border-radius: 4px;
		color: inherit;
		font-variant-numeric: tabular-nums;
	}
	.vote.up {
		margin-left: 3px;
	}
	.vote :global(svg) {
		font-size: 1.1rem;
	}
	button.vote {
		cursor: pointer;
	}
	button.vote:hover {
		background-color: rgba(0, 0, 0, 0.06);
	}
	button.vote:hover,
	button.vote.active {
		color: black;
	}
	button.vote.active {
		font-weight: 600;
	}
	button.vote.active :global(svg) {
		fill: currentColor;
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
	.prompt {
		font-size: 0.9rem;
		color: rgba(0, 0, 0, 0.6);
		/* close to the box it is about */
		margin-bottom: -4px;
	}
	.verdict-choice,
	.form-actions {
		display: flex;
		gap: 8px;
	}
	.reviews .std-btn {
		cursor: pointer;
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
		margin-top: 8px;
		color: red;
		padding-left: 16px;
	}
	.empty {
		margin: 16px 0;
		color: rgba(0, 0, 0, 0.5);
	}
</style>
