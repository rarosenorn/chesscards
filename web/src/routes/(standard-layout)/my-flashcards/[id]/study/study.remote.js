import { getRequestEvent, command } from "$app/server"
import { error } from "@sveltejs/kit"
import * as decks from "$lib/server/decks.js"
import * as marketplace from "$lib/server/marketplace.js"

export const updateCardStudyStateAndAddLog =
	command("unchecked", async ({ card, log }) => {
		const { locals } = getRequestEvent();

		// marketplace card instances carry marketplace_deck_instance_id instead of deck_id
		if (card.marketplace_deck_instance_id) {
			if (!await marketplace.updateInstanceCardStudyState(locals.userId, card)) {
				error(403, "Unauthorized");
			}
			await marketplace.createInstanceReviewLog(locals.userId, card.id, log);
			return;
		}

		if (!await decks.userIdOwnsDeckId(locals.userId, card.deck_id)) {
			error(403, "Unauthorized");
		}
		await decks.updateCardStudyState(locals.userId, card);
		await decks.createReviewLog(locals.userId, card.id, log);
	})
