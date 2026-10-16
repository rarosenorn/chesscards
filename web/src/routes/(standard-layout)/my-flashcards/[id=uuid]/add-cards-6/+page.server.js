import { error } from "@sveltejs/kit"
import { createEmptyCard } from "ts-fsrs"
import * as decks from "$lib/server/decks.js"
import { isUuid } from "$lib/uuid.js"

// marketplace deck instances are readonly: no add-cards page for them
const load = async ({ parent }) => {
	const { deck } = await parent();
	if (deck.isMarketplace) error(404);
}

const actions = {
	default: async ({ params, request, locals }) => {
		const data = await request.formData();
		const cardType = data.get("cardType") === "tactic" ? "tactic" : "basic";
		const FSRSValues = Object.values(createEmptyCard());
		// returned so the client can add it to the shared deck context, making
		// it visible in browse/study without a reload
		// the deck the card goes in: this one, or one inside it
		const deckId = data.get("deckId") || params.id;
		if (!isUuid(deckId)) error(400, "Bad request");
		try {
			const card = await decks.addCard(
				locals.userId, deckId, data.get("front"), data.get("back"), cardType, FSRSValues
			)
			return { card };
		} catch (err) {
			// not a deck of the user's own (a marketplace deck's is never one)
			if (err.message === "Unauthorized") error(403, "Unauthorized");
			throw err;
		}
	}
}

export { load, actions }
