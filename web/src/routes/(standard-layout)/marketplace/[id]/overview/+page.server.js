import { fail, redirect } from "@sveltejs/kit"
import * as marketplace from "$lib/server/marketplace.js"

export const load = async ({ params, locals }) => {
	return {
		reviews: await marketplace.getReviews(params.id, locals.userId)
	}
}

// a form posts a text area's line breaks as \r\n
const text = value => value?.toString().replace(/\r\n/g, "\n").trim();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// the review actions are also posted to from the Deck tab of someone who has
// the deck (DeckReviews), which shows the same reviews
export const actions = {
	getDeck: async ({ params, locals, url }) => {
		if (!locals.userId) {
			redirect(303, `/login?redirect_to=${url.pathname}`);
		}
		try {
			await marketplace.createDeckInstance(locals.userId, params.id);
		} catch (err) {
			return fail(400, { errors: [err.message] });
		}
		redirect(303, "/my-flashcards");
	},

	// a first review, or the rewrite of the one already posted
	saveReview: async ({ request, params, locals, url }) => {
		if (!locals.userId) {
			redirect(303, `/login?redirect_to=${url.pathname}`);
		}
		const data = await request.formData();

		const recommended = data.get("recommended");
		if (recommended !== "true" && recommended !== "false") {
			return fail(400, { errors: ["Choose whether you recommend the deck"] });
		}
		// a thumb alone says little: the reason goes with it, as on Steam
		const body = text(data.get("body"));
		if (!body) {
			return fail(400, { errors: ["Write why you do or don't recommend the deck"] });
		}
		if (body.length > 5000) {
			return fail(400, { errors: ["A review can be at most 5000 characters"] });
		}

		const saved = await marketplace.saveReview(locals.userId, params.id, {
			recommended: recommended === "true",
			body
		});
		if (!saved) {
			return fail(403, { errors: ["Only someone who has the deck, and did not write it, can review it"] });
		}
	},

	deleteReview: async ({ params, locals, url }) => {
		if (!locals.userId) {
			redirect(303, `/login?redirect_to=${url.pathname}`);
		}
		const deleted = await marketplace.deleteReview(locals.userId, params.id);
		if (!deleted) {
			return fail(404, { errors: ["You have no review of this deck"] });
		}
	},

	vote: async ({ request, params, locals, url }) => {
		if (!locals.userId) {
			redirect(303, `/login?redirect_to=${url.pathname}`);
		}
		const data = await request.formData();

		const value = Number(data.get("value"));
		if (![-1, 0, 1].includes(value)) {
			return fail(400, { errors: ["Invalid vote"] });
		}
		const reviewId = data.get("reviewId")?.toString() ?? "";
		const voted = UUID.test(reviewId)
			&& await marketplace.setReviewVote(locals.userId, params.id, reviewId, value);
		if (!voted) {
			return fail(400, { errors: ["You can't vote on this review"] });
		}
	},

	// the deck author's reply to a review; an empty one takes it down
	respond: async ({ request, params, locals, url }) => {
		if (!locals.userId) {
			redirect(303, `/login?redirect_to=${url.pathname}`);
		}
		const data = await request.formData();

		const response = text(data.get("response")) || null;
		if (response && response.length > 5000) {
			return fail(400, { errors: ["A response can be at most 5000 characters"] });
		}
		const reviewId = data.get("reviewId")?.toString() ?? "";
		const saved = UUID.test(reviewId)
			&& await marketplace.setReviewResponse(locals.userId, params.id, reviewId, response);
		if (!saved) {
			return fail(403, { errors: ["Only the deck's author can respond to its reviews"] });
		}
	}
}
