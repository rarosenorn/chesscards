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

// The stage ops renumber positions across the deck, so each returns the
// fresh deck for the client to assign into the shared context — mirroring
// the renumbering locally would just re-implement the server.
const freshDeck = async (locals, deckId) => {
	const deck = await decks.getById(locals.userId, deckId);
	if (!deck) error(403, "Unauthorized");
	return deck;
}

export const createStage =
	command("unchecked", async ({ deckId, name }) => {
		const { locals } = getRequestEvent();
		if (!await decks.createStage(locals.userId, deckId, name ?? null)) {
			error(403, "Unauthorized");
		}
		return freshDeck(locals, deckId);
	})

export const renameStage =
	command("unchecked", async ({ deckId, stageId, name }) => {
		const { locals } = getRequestEvent();
		if (!await decks.renameStage(locals.userId, stageId, name || null)) {
			error(403, "Unauthorized");
		}
		return freshDeck(locals, deckId);
	})

export const deleteStage =
	command("unchecked", async ({ deckId, stageId }) => {
		const { locals } = getRequestEvent();
		await decks.deleteStage(locals.userId, stageId);
		return freshDeck(locals, deckId);
	})

export const moveCards =
	command("unchecked", async ({ deckId, cardIds, stageId, index }) => {
		const { locals } = getRequestEvent();
		await decks.moveCards(locals.userId, deckId, cardIds, stageId, index ?? null);
		return freshDeck(locals, deckId);
	})
