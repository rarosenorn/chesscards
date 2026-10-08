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

const UUID = /^[0-9a-f-]{36}$/i;
const checkIds = (...ids) => {
	if (!ids.flat().every(id => typeof id === "string" && UUID.test(id))) error(400, "Bad request");
}

// The subdeck ops renumber positions across the deck, so each returns the
// fresh deck for the client to assign into the shared context — mirroring
// the renumbering locally would just re-implement the server.
const freshDeck = async (locals, deckId) => {
	const deck = await decks.getById(locals.userId, deckId);
	if (!deck) error(403, "Unauthorized");
	return deck;
}

// A subdeck always has a name: the callers only offer to create or rename
// one through a field, and a blank one is a cancelled edit, not an erasure.
// parentId names the subdeck the new one goes inside; without it the new one
// joins the deck's top level
export const createSubdeck =
	command("unchecked", async ({ deckId, name, parentId }) => {
		const { locals } = getRequestEvent();
		const trimmed = name?.trim();
		if (!trimmed) error(400, "A subdeck needs a name");
		checkIds(deckId, parentId ?? []);
		try { await decks.createSubdeck(locals.userId, deckId, trimmed, parentId ?? null); }
		catch (err) { if (err.message === "Unauthorized") error(403, "Unauthorized"); throw err; }
		return freshDeck(locals, deckId);
	})

export const renameSubdeck =
	command("unchecked", async ({ deckId, subdeckId, name }) => {
		const { locals } = getRequestEvent();
		const trimmed = name?.trim();
		if (!trimmed) error(400, "A subdeck needs a name");
		if (!await decks.renameSubdeck(locals.userId, subdeckId, trimmed)) {
			error(403, "Unauthorized");
		}
		return freshDeck(locals, deckId);
	})

// a subdeck goes with the subdecks and cards inside it
export const deleteSubdeck =
	command("unchecked", async ({ deckId, subdeckId }) => {
		const { locals } = getRequestEvent();
		checkIds(deckId, subdeckId);
		try { await decks.deleteSubdeck(locals.userId, subdeckId); }
		catch (err) { if (err.message === "Unauthorized") error(403, "Unauthorized"); throw err; }
		return freshDeck(locals, deckId);
	})

// a subdeck moves, with what is inside it, to index among the subdecks of
// parentId (the deck's top level without one; the end without an index)
export const moveSubdeck =
	command("unchecked", async ({ deckId, subdeckId, parentId, index }) => {
		const { locals } = getRequestEvent();
		checkIds(deckId, subdeckId, parentId ?? []);
		try { await decks.moveSubdeck(locals.userId, deckId, subdeckId, parentId ?? null, index ?? null); }
		catch (err) { if (err.message === "Unauthorized") error(403, "Unauthorized"); throw err; }
		return freshDeck(locals, deckId);
	})

export const moveCards =
	command("unchecked", async ({ deckId, cardIds, subdeckId, index }) => {
		const { locals } = getRequestEvent();
		await decks.moveCards(locals.userId, deckId, cardIds, subdeckId, index ?? null);
		return freshDeck(locals, deckId);
	})

// the decks a card can be sent to
export const listDecks =
	command("unchecked", async () => {
		const { locals } = getRequestEvent();
		return decks.getNames(locals.userId);
	})

// both answer with this deck afresh: a move empties it of the cards, and a
// copy into the deck itself adds to it
export const moveCardsToDeck =
	command("unchecked", async ({ deckId, cardIds, targetDeckId }) => {
		const { locals } = getRequestEvent();
		checkIds(deckId, cardIds, targetDeckId);
		try { await decks.moveCardsToDeck(locals.userId, deckId, cardIds, targetDeckId); }
		catch (err) { if (err.message === "Unauthorized") error(403, "Unauthorized"); throw err; }
		return freshDeck(locals, deckId);
	})

export const copyCards =
	command("unchecked", async ({ deckId, cardIds, targetDeckId, subdeckId }) => {
		const { locals } = getRequestEvent();
		checkIds(deckId, cardIds, targetDeckId, subdeckId ?? []);
		try {
			await decks.copyCards(locals.userId, deckId, cardIds, targetDeckId, subdeckId ?? null, Object.values(createEmptyCard()));
		} catch (err) { if (err.message === "Unauthorized") error(403, "Unauthorized"); throw err; }
		return freshDeck(locals, deckId);
	})
