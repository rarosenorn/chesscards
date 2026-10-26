import { fail, redirect } from "@sveltejs/kit"
import { createEmptyCard } from "ts-fsrs"
import * as decks from "$lib/server/decks.js"
import * as marketplace from "$lib/server/marketplace.js"
import * as zod from "$lib/zod-schemas.js"

export const load = async ({ locals, params, parent }) => {
	// a marketplace deck taken, or a deck inside one, has nothing here but how
	// it is studied: the deck's name, cards and listing are its author's
	const { deck } = await parent();
	const own = deck.isMarketplace ? null : await decks.getOwnListing(locals.userId, params.id);

	return {
		pageTitle: "Settings",
		uploadRequest: own && await marketplace.getUploadRequestForDeck(locals.userId, params.id),
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
	// a deck of the user's own goes with everything inside it; a marketplace
	// deck taken leaves their library
	delete: async ({ params, locals }) => {
		if (!await decks.remove(locals.userId, params.id)) await decks.removeTaken(locals.userId, params.id);
		redirect(303, "/my-flashcards");
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
