import { getRequestEvent, command } from "$app/server"
import { error } from "@sveltejs/kit"
import { createEmptyCard } from "ts-fsrs"
import * as decks from "$lib/server/decks.js"

export const updateCardContent =
	command("unchecked", async ({ cardId, front, back }) => {
		const { locals } = getRequestEvent();
		if (!await decks.updateCardContent(locals.userId, cardId, front, back)) {
			error(403, "Unauthorized");
		}
	})

// the updated card goes back to the client, which puts it into the shared
// deck context — the row's Due/Reps/State follow the new type at once
export const updateCardType =
	command("unchecked", async ({ cardId, cardType }) => {
		const { locals } = getRequestEvent();
		const type = cardType === "tactic" ? "tactic" : "basic";
		const card = await decks.updateCardType(locals.userId, cardId, type, Object.values(createEmptyCard()));
		if (!card) error(403, "Unauthorized");
		return card;
	})

export const deleteCards =
	command("unchecked", async ({ cardIds }) => {
		const { locals } = getRequestEvent();
		if (await decks.deleteCards(locals.userId, cardIds) === 0) {
			error(403, "Unauthorized");
		}
	})
