import { getRequestEvent, command } from "$app/server"
import { error } from "@sveltejs/kit"
import { createEmptyCard } from "ts-fsrs"
import * as decks from "$lib/server/decks.js"
import * as zod from "$lib/zod-schemas.js"
import { checkIds, checkIdList, checkIndex } from "$lib/server/ids.js"
import { sideHasContent } from "$lib/card-utils.js"

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
// It is stored without the space around it.
const subdeckName = name => {
	const result = zod.subdeck.safeParse(name);
	if (!result.success) error(400, result.error.flatten().formErrors[0]);
	return result.data;
}

// parentId names the subdeck the new one goes inside; without it the new one
// joins the deck's top level
export const createSubdeck =
	command("unchecked", async ({ deckId, name, parentId }) => {
		const { locals } = getRequestEvent();
		const trimmed = subdeckName(name);
		checkIds(deckId, parentId ?? []);
		try { await decks.createSubdeck(locals.userId, deckId, trimmed, parentId ?? null); }
		catch (err) { if (err.message === "Unauthorized") error(403, "Unauthorized"); throw err; }
		return freshDeck(locals, deckId);
	})

export const renameSubdeck =
	command("unchecked", async ({ deckId, subdeckId, name }) => {
		const { locals } = getRequestEvent();
		const trimmed = subdeckName(name);
		checkIds(deckId, subdeckId);
		if (!await decks.renameSubdeck(locals.userId, subdeckId, trimmed)) {
			error(403, "Unauthorized");
		}
		return freshDeck(locals, deckId);
	})

// The intro page of the deck, or of the subdeck named: blocks, as a card's
// side is stored. One with nothing on it is no intro. What was stored goes
// back, for the client to put in the shared deck.
export const saveIntro =
	command("unchecked", async ({ deckId, subdeckId, intro }) => {
		const { locals } = getRequestEvent();
		checkIds(deckId, subdeckId ?? []);
		if (!Array.isArray(intro)) error(400, "Bad request");
		const blocks = sideHasContent(intro) ? intro : null;
		if (!await decks.updateIntro(locals.userId, deckId, subdeckId ?? null, blocks)) {
			error(403, "Unauthorized");
		}
		return blocks;
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

// the subdecks inside a subdeck — or, with none named, all the deck's — are
// taken away and their cards stay, in order
export const flattenSubdecks =
	command("unchecked", async ({ deckId, subdeckId }) => {
		const { locals } = getRequestEvent();
		checkIds(deckId, subdeckId ?? []);
		try { await decks.flattenSubdecks(locals.userId, deckId, subdeckId ?? null); }
		catch (err) { if (err.message === "Unauthorized") error(403, "Unauthorized"); throw err; }
		return freshDeck(locals, deckId);
	})

// a subdeck moves, with what is inside it, to index among the subdecks of
// parentId (the deck's top level without one; the end without an index)
export const moveSubdeck =
	command("unchecked", async ({ deckId, subdeckId, parentId, index }) => {
		const { locals } = getRequestEvent();
		checkIds(deckId, subdeckId, parentId ?? []);
		checkIndex(index);
		try { await decks.moveSubdeck(locals.userId, deckId, subdeckId, parentId ?? null, index ?? null); }
		catch (err) { if (err.message === "Unauthorized") error(403, "Unauthorized"); throw err; }
		return freshDeck(locals, deckId);
	})

export const moveCards =
	command("unchecked", async ({ deckId, cardIds, subdeckId, index }) => {
		const { locals } = getRequestEvent();
		checkIdList(cardIds);
		checkIds(deckId, subdeckId);
		checkIndex(index);
		try { await decks.moveCards(locals.userId, deckId, cardIds, subdeckId, index ?? null); }
		catch (err) { if (err.message === "Unauthorized") error(403, "Unauthorized"); throw err; }
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
		checkIdList(cardIds);
		checkIds(deckId, targetDeckId);
		try { await decks.moveCardsToDeck(locals.userId, deckId, cardIds, targetDeckId); }
		catch (err) { if (err.message === "Unauthorized") error(403, "Unauthorized"); throw err; }
		return freshDeck(locals, deckId);
	})

export const copyCards =
	command("unchecked", async ({ deckId, cardIds, targetDeckId, subdeckId }) => {
		const { locals } = getRequestEvent();
		checkIdList(cardIds);
		checkIds(deckId, targetDeckId, subdeckId ?? []);
		try {
			await decks.copyCards(locals.userId, deckId, cardIds, targetDeckId, subdeckId ?? null, Object.values(createEmptyCard()));
		} catch (err) { if (err.message === "Unauthorized") error(403, "Unauthorized"); throw err; }
		return freshDeck(locals, deckId);
	})
