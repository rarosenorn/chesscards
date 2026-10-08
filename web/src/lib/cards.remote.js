import { getRequestEvent, command } from "$app/server"
import { error } from "@sveltejs/kit"
import { createEmptyCard } from "ts-fsrs"
import * as decks from "$lib/server/decks.js"
import * as marketplace from "$lib/server/marketplace.js"
import { checkIds, checkIdList } from "$lib/server/ids.js"

// What is done to a card from wherever it is shown: study grades it, and
// study and the Cards tab both edit and delete it.

export const updateCardStudyStateAndAddLog =
	command("unchecked", async ({ card, log }) => {
		const { locals } = getRequestEvent();
		if (!card || !log) error(400, "Bad request");
		checkIds(card.id);

		// marketplace card instances carry marketplace_deck_instance_id instead of deck_id
		if (card.marketplace_deck_instance_id) {
			if (!await marketplace.updateInstanceCardStudyState(locals.userId, card)) {
				error(403, "Unauthorized");
			}
			await marketplace.createInstanceReviewLog(locals.userId, card.id, log);
			return;
		}

		if (!await decks.updateCardStudyState(locals.userId, card)) {
			error(403, "Unauthorized");
		}
		await decks.createReviewLog(locals.userId, card.id, log);
	})

export const updateCardContent =
	command("unchecked", async ({ cardId, front, back }) => {
		const { locals } = getRequestEvent();
		checkIds(cardId);
		if (!await decks.updateCardContent(locals.userId, cardId, front, back)) {
			error(403, "Unauthorized");
		}
	})

// the updated card goes back to the client, which puts it into the shared
// deck context — the row's Due/Reps/State follow the new type at once
export const updateCardType =
	command("unchecked", async ({ cardId, cardType }) => {
		const { locals } = getRequestEvent();
		checkIds(cardId);
		const type = cardType === "tactic" ? "tactic" : "basic";
		const card = await decks.updateCardType(locals.userId, cardId, type, Object.values(createEmptyCard()));
		if (!card) error(403, "Unauthorized");
		return card;
	})

export const deleteCards =
	command("unchecked", async ({ cardIds }) => {
		const { locals } = getRequestEvent();
		checkIdList(cardIds);
		if (await decks.deleteCards(locals.userId, cardIds) === 0) {
			error(403, "Unauthorized");
		}
	})
