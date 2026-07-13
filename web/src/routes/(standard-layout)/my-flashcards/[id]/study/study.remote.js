import { getRequestEvent, command } from "$app/server"
import { error } from "@sveltejs/kit"
import * as decks from "$lib/server/decks.js"

export const updateCardStudyStateAndAddLog = 
	command("unchecked", async ({ card, log }) => {
		const { locals } = getRequestEvent();
		if (!await decks.userIdOwnsDeckId(locals.userId, card.deck_id)) {
			error(403, "Unauthorized");
		}
		await decks.updateCardStudyState(locals.userId, card);
		await decks.createReviewLog(locals.userId, card.id, log);
	})
