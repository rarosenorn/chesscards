import { fail, redirect } from "@sveltejs/kit"
import { createEmptyCard } from "ts-fsrs"
import * as decks from "$lib/server/decks.js"
import * as marketplace from "$lib/server/marketplace.js"
import * as zod from "$lib/zod-schemas.js"
import { RETENTIONS } from "$lib/retention.js"

export const load = async ({ locals, params, parent }) => {
	// a marketplace deck taken, or a deck inside one, has nothing here but how
	// it is studied: the deck's name, cards and listing are its author's
	const { deck } = await parent();
	const own = deck.isMarketplace ? null : await decks.getOwnListing(locals.userId, params.id);

	return {
		pageTitle: "Settings",
		uploadRequest: own && await marketplace.getUploadRequestForDeck(locals.userId, params.id),
		listing: own && await marketplace.getListingForDeck(locals.userId, params.id),
		// a marketplace deck taken inside it keeps it off the marketplace
		holdsTaken: own?.holdsTaken ?? false
	}
}

export const actions = {
	// every card under the deck, the marketplace decks taken inside it too;
	// the reset is scoped to the user by its joins
	reset: async ({ params, locals }) => {
		const cards = await decks.reset(locals.userId, params.id, Object.values(createEmptyCard()));

		return { cards };
	},
	// in order or mixed, for the decks inside it: on a deck of the user's own
	// its own setting, on a marketplace deck taken their choice beside the
	// author's
	inOrder: async ({ params, request, locals }) => {
		const value = (await request.formData()).get("value");
		if (value !== "in-order" && value !== "mixed") return fail(400, { errors: ["Invalid choice"] });
		await decks.setInOrder(locals.userId, params.id, value === "in-order");
	},
	// shuffled or in order, for the cards due for review: said on a deck at
	// the top of the list, for everything inside it
	reviewsInOrder: async ({ params, request, locals }) => {
		const value = (await request.formData()).get("value");
		if (value !== "in-order" && value !== "mixed") return fail(400, { errors: ["Invalid choice"] });
		if (!await decks.setReviewsInOrder(locals.userId, params.id, value === "in-order")) return fail(403, { errors: ["Not a deck at the top"] });
	},
	// the days a solved tactic card waits, step by step, as typed ("14, 60,
	// 180"); left empty, the deck takes the ladder of the deck above it
	tacticLadder: async ({ params, request, locals }) => {
		const typed = String((await request.formData()).get("ladder") ?? "").trim();
		const steps = typed === "" ? [] : typed.split(/[\s,]+/).filter(Boolean);
		if (steps.length > 12 || steps.some(step => !/^\d+$/.test(step) || +step < 1 || +step > 3650)) {
			return fail(400, { ladder: typed, ladderErrors: ["Whole days from 1 to 3650, at most 12 steps"] });
		}
		const ladder = steps.length === 0 ? null : steps.map(Number);
		if (!await decks.setTacticLadder(locals.userId, params.id, ladder)) return fail(403, { ladder: typed, ladderErrors: ["Not a deck of your own"] });
		return { ladderSaved: true };
	},
	// every deck of the user's own inside this one takes its tactic ladder
	ladderInside: async ({ params, locals }) => {
		if (!await decks.followTacticLadder(locals.userId, params.id)) return fail(403, { ladderErrors: ["Not a deck of your own"] });
		return { followed: "ladder" };
	},
	// the recall FSRS schedules the deck's cards for, or "inherit" to take the
	// one above's (or the user's own); on a marketplace deck taken, the
	// studier's own
	retention: async ({ params, request, locals }) => {
		const value = (await request.formData()).get("retention");
		const retention = value === "inherit" ? null : Number(value);
		if (retention !== null && !RETENTIONS.includes(retention)) return fail(400, { retentionErrors: ["Invalid desired retention"] });
		if (!await decks.setRetention(locals.userId, params.id, retention)) return fail(403, { retentionErrors: ["Not a deck of yours"] });
	},
	// every deck inside this one gives up its own desired retention, to follow it
	retentionInside: async ({ params, locals }) => {
		if (!await decks.followRetention(locals.userId, params.id)) return fail(403, { retentionErrors: ["Not a deck of yours"] });
		return { followed: "retention" };
	},
	// a deck of the user's own goes with everything inside it; a marketplace
	// deck taken leaves their library
	delete: async ({ params, locals }) => {
		if (!await decks.remove(locals.userId, params.id)) await decks.removeTaken(locals.userId, params.id);
		redirect(303, "/my-flashcards");
	},
	onSale: async ({ params, request, locals }) => {
		const onSale = (await request.formData()).get("on-sale") === "true";
		const listing = await marketplace.getListingForDeck(locals.userId, params.id);
		if (!listing || !await marketplace.setOnSale(locals.userId, listing.id, onSale)) return fail(404, { errors: ["This deck is not on the marketplace"] });
	},
	rename: async ({ params, request, locals }) => {
		const data = await request.formData();
		const result = zod.deck.safeParse(data.get("name"));
		if (!result.success) {
			return fail(400, { name: data.get("name"), errors: result.error.flatten().formErrors });
		}
		try {
			await decks.rename(locals.userId, params.id, result.data);
		} catch (err) {
			if (err.code === "23505") {
				return fail(409, {
					name: data.get("name"),
					errors: ["There is already a deck with this name there"]
				})
			}
			throw err;
		}
	}
}
