import { createEmptyCard } from "ts-fsrs"
import * as decks from "$lib/server/decks.js"

const actions = {
	default: async ({ params, request, locals }) => {
		const data = await request.formData();
		const FSRSValues = Object.values(createEmptyCard());
		 await decks.addCard(
			 locals.userId, params.id, data.get("front"), data.get("back"), FSRSValues
		 )
	}
}

export { actions }
