import { error, fail } from "@sveltejs/kit"
import * as decks from "$lib/server/decks.js"

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const load = async ({ locals, params }) => {
	// a marketplace deck's sample cards are its author's; a deck's own are
	// chosen from every card under it
	const deck = await decks.getDeck(locals.userId, params.id);
	if (!deck || deck.isMarketplace) error(404);

	const listing = await decks.getOwnListing(locals.userId, params.id);

	return {
		deck,
		previewCardIds: listing.previewCardIds
	}
}

export const actions = {
	save: async ({ request, locals, params }) => {
		const data = await request.formData();

		let previewCardIds;
		try {
			previewCardIds = JSON.parse(data.get("previewCardIds") ?? "[]");
		} catch {
			return fail(400, { errors: ["Invalid sample card selection"] });
		}
		if (
			!Array.isArray(previewCardIds)
			|| !previewCardIds.every(id => typeof id === "string" && uuidPattern.test(id))
		) {
			return fail(400, { errors: ["Invalid sample card selection"] });
		}

		if (!await decks.updatePreviewCards(locals.userId, params.id, previewCardIds)) error(404);
	}
}
