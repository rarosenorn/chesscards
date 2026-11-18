import { error, fail, redirect } from "@sveltejs/kit"
import * as marketplace from "$lib/server/marketplace.js"
import * as payments from "$lib/server/payments.js"
import { sendMail, supportEmail } from "$lib/server/mail.js"

export const load = async ({ locals, parent }) => {
	// the layout decides who may see the deck; a page's data is sent even
	// when its layout refuses, unless the page waits for it
	const { mpDeck } = await parent();
	return {
		contents: await marketplace.getDeckContents(mpDeck.id),
		reviews: await marketplace.getReviews(mpDeck.id, locals.userId),
		isAdmin: locals.isAdmin
	}
}

// a form posts a text area's line breaks as \r\n
const text = value => value?.toString().replace(/\r\n/g, "\n").trim();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// a page open since a rename posts to the deck's old name, which still finds it
const deckOf = async params => {
	const deck = await marketplace.findDeckBySlug(params.slug);
	if (!deck) error(404);
	return deck;
}

const overview = deck => `/marketplace/${encodeURIComponent(deck.slug)}/overview`;

const tellAuthor = async (deck, message) => {
	if (!deck.authorEmail) return;
	await sendMail({
		to: deck.authorEmail,
		replyTo: supportEmail(),
		subject: `Your marketplace deck: ${deck.name}`,
		text: message,
		html: message.split("\n\n").map(line => `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`).join("")
	}).catch(err => console.error("takedown email failed", err));
}

// the review actions are also posted to from the Deck tab of someone who has
// the deck (DeckReviews), which shows the same reviews
export const actions = {
	// free decks, the author's own and decks bought before come straight in;
	// anything else goes through Stripe Checkout
	getDeck: async ({ request, params, locals, url }) => {
		if (!locals.userId) {
			redirect(303, `/login?redirect_to=${url.pathname}`);
		}
		const { id } = await deckOf(params);
		const deck = await marketplace.getDeckForSale(id);
		if (!deck) error(404);
		const { owned, inLibrary } = await marketplace.getOwnership(locals.userId, id);
		if (!deck.for_sale && !owned) error(404);
		if (inLibrary) return fail(400, { errors: ["You already have this deck"] });

		if (owned || deck.price_cents === 0) {
			try {
				await marketplace.createDeckInstance(locals.userId, id);
			} catch (err) {
				return fail(400, { errors: [err.message] });
			}
			redirect(303, "/my-flashcards");
		}

		const checkoutUrl = await payments.createCheckout({ user: locals.user, deck });
		redirect(303, checkoutUrl);
	},

	onSale: async ({ request, params, locals }) => {
		const onSale = (await request.formData()).get("on-sale") === "true";
		const deck = await deckOf(params);
		if (!locals.userId || !await marketplace.setOnSale(locals.userId, deck.id, onSale)) error(404);
		redirect(303, overview(deck));
	},

	// the new name waits for an admin's approval
	rename: async ({ request, params, locals }) => {
		const name = text((await request.formData()).get("name")) ?? "";
		if (name.length < 4 || name.length > 100) {
			return fail(400, { errors: ["Name must be between 4 and 100 characters"], rename: name });
		}
		const deck = await deckOf(params);
		if (!locals.userId) error(404);
		let requested;
		try {
			requested = await marketplace.requestRename(locals.userId, deck.id, name);
		} catch (err) {
			return fail(400, { errors: [err.message], rename: name });
		}
		if (!requested) error(404);
		redirect(303, overview(deck));
	},

	takeDown: async ({ request, params, locals }) => {
		if (!locals.isAdmin) error(404);
		const reason = text((await request.formData()).get("reason"));
		if (!reason) return fail(400, { errors: ["Write why the deck is taken down; the author is sent it"] });
		const found = await deckOf(params);
		const deck = await marketplace.setTakenDown(found.id, reason);
		if (!deck) error(404);
		await tellAuthor(deck, `We have taken "${deck.name}" off the Chesscards marketplace: ${reason}\n\nThose who have the deck keep it. If you think this is wrong, reply to this email.`);
		redirect(303, overview(found));
	},

	restore: async ({ params, locals }) => {
		if (!locals.isAdmin) error(404);
		const found = await deckOf(params);
		const deck = await marketplace.setTakenDown(found.id, null);
		if (!deck) error(404);
		await tellAuthor(deck, `"${deck.name}" is back on the Chesscards marketplace.`);
		redirect(303, overview(found));
	},

	// a first review, or the rewrite of one posted a moment ago
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

		const saved = await marketplace.saveReview(locals.userId, (await deckOf(params)).id, {
			recommended: recommended === "true",
			body
		});
		if (saved === "locked") {
			return fail(403, { errors: ["A review can be edited for 5 minutes after it is posted. Delete it to write a new one."] });
		}
		if (saved === "refused") {
			return fail(403, { errors: ["Only someone who has the deck, and did not write it, can review it"] });
		}
	},

	deleteReview: async ({ params, locals, url }) => {
		if (!locals.userId) {
			redirect(303, `/login?redirect_to=${url.pathname}`);
		}
		const deleted = await marketplace.deleteReview(locals.userId, (await deckOf(params)).id);
		if (!deleted) {
			return fail(404, { errors: ["You have no review of this deck"] });
		}
	},

	// moderation: an admin takes down anyone's review, or the author's
	// response to one
	removeReview: async ({ request, params, locals }) => {
		if (!locals.isAdmin) return fail(403, { errors: ["Only an admin can remove a review"] });
		const reviewId = (await request.formData()).get("reviewId")?.toString() ?? "";
		const removed = UUID.test(reviewId) && await marketplace.removeReview((await deckOf(params)).id, reviewId);
		if (!removed) return fail(404, { errors: ["No such review"] });
	},

	removeResponse: async ({ request, params, locals }) => {
		if (!locals.isAdmin) return fail(403, { errors: ["Only an admin can remove a response"] });
		const reviewId = (await request.formData()).get("reviewId")?.toString() ?? "";
		const removed = UUID.test(reviewId) && await marketplace.removeReviewResponse((await deckOf(params)).id, reviewId);
		if (!removed) return fail(404, { errors: ["No such review"] });
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
			&& await marketplace.setReviewVote(locals.userId, (await deckOf(params)).id, reviewId, value);
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
			&& await marketplace.setReviewResponse(locals.userId, (await deckOf(params)).id, reviewId, response);
		if (!saved) {
			return fail(403, { errors: ["Only the deck's author can respond to its reviews"] });
		}
	}
}
