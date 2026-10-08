import { error } from "@sveltejs/kit"
import { createEmptyCard } from "ts-fsrs"
import * as decks from "$lib/server/decks.js"

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
		const card = await decks.addCard(
			locals.userId, params.id, data.get("front"), data.get("back"), cardType, FSRSValues
		)
		return { card };
	}
}

export { load, actions }
