import { getRequestEvent, command } from "$app/server"
import { error } from "@sveltejs/kit"
import { createEmptyCard } from "ts-fsrs"
import * as decks from "$lib/server/decks.js"
import { checkIds, checkIdList, checkIndex } from "$lib/server/ids.js"
import { sideHasContent } from "$lib/card-utils.js"
import { isIntroBlocks } from "$lib/intros.js"
import { deckOutline } from "$lib/deck-tree.js"

// The card ops renumber positions across the decks they touch, so each
// returns the deck the page is on afresh, for the client to assign into the
// shared context — mirroring the renumbering locally would just
// re-implement the server.
const freshDeck = async (locals, deckId) => {
	const deck = await decks.getDeck(locals.userId, deckId);
	if (!deck) error(403, "Unauthorized");
	return deck;
}

const refused = err => {
	if (err.message === "Unauthorized") error(403, "Unauthorized");
	throw err;
}

// The intro page of a deck of the user's own: blocks, as a card's side is
// stored. One with nothing on it is no intro. What was stored goes back, for
// the client to put in the shared deck.
export const saveIntro =
	command("unchecked", async ({ deckId, intro }) => {
		const { locals } = getRequestEvent();
		checkIds(deckId);
		if (!isIntroBlocks(intro)) error(400, "Bad request");
		// only what a block is made of is kept, whatever else was sent with it
		const page = intro.map(({ type, content }) => ({ type, content }));
		const blocks = sideHasContent(page) ? page : null;
		if (!await decks.updateIntro(locals.userId, deckId, blocks)) {
			error(403, "Unauthorized");
		}
		return blocks;
	})

// Cards go to index (the end without one) of a deck of the user's own: a
// drag on the Cards tab, a typed place, or sending them to another deck
// altogether. deckId is the deck the page is on.
export const moveCards =
	command("unchecked", async ({ deckId, cardIds, targetDeckId, index }) => {
		const { locals } = getRequestEvent();
		checkIdList(cardIds);
		checkIds(deckId, targetDeckId);
		checkIndex(index);
		try { await decks.moveCards(locals.userId, cardIds, targetDeckId, index ?? null); }
		catch (err) { refused(err); }
		return freshDeck(locals, deckId);
	})

// copies, new to study, at the end of a deck of the user's own
export const copyCards =
	command("unchecked", async ({ deckId, cardIds, targetDeckId }) => {
		const { locals } = getRequestEvent();
		checkIdList(cardIds);
		checkIds(deckId, targetDeckId);
		try { await decks.copyCards(locals.userId, cardIds, targetDeckId, Object.values(createEmptyCard())); }
		catch (err) { refused(err); }
		return freshDeck(locals, deckId);
	})

// The user's own decks, as an outline, for the pickers that send cards to
// one: each { id, name, level }, in reading order.
export const listDecks =
	command("unchecked", async () => {
		const { locals } = getRequestEvent();
		const own = (await decks.getLibrary(locals.userId)).filter(deck => !deck.bought);
		return deckOutline(own).map(({ deck, level }) => ({ id: deck.id, name: deck.name, level }));
	})
