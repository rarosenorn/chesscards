import { getRequestEvent, command } from "$app/server"
import { error } from "@sveltejs/kit"
import * as decks from "$lib/server/decks.js"
import * as zod from "$lib/zod-schemas.js"
import { checkIds, checkIndex } from "$lib/server/ids.js"

// What My flashcards does to the decks themselves: make them, name them,
// nest them, take them apart. The page reloads its list after each.

const deckName = name => {
	const result = zod.deck.safeParse(name);
	if (!result.success) error(400, result.error.flatten().formErrors[0]);
	return result.data;
}

const refused = err => {
	if (err.message === "Unauthorized") error(403, "Unauthorized");
	if (err.message === "A deck cannot go inside itself") error(400, err.message);
	// a name is said once among a deck's siblings
	if (err.code === "23505") error(409, "There is already a deck with this name there");
	throw err;
}

// a new deck at the end of the top of the list, or inside parentId
export const createDeck =
	command("unchecked", async ({ name, parentId }) => {
		const { locals } = getRequestEvent();
		const trimmed = deckName(name);
		checkIds(parentId ?? []);
		try { return await decks.create(locals.userId, trimmed, parentId ?? null); }
		catch (err) { refused(err); }
	})

export const renameDeck =
	command("unchecked", async ({ id, name }) => {
		const { locals } = getRequestEvent();
		const trimmed = deckName(name);
		checkIds(id);
		try { if (!await decks.rename(locals.userId, id, trimmed)) error(403, "Unauthorized"); }
		catch (err) { refused(err); }
	})

// a deck, or a marketplace deck taken, goes to index (the end without one)
// among the decks inside parentId, or at the top without one
export const moveDeck =
	command("unchecked", async ({ id, parentId, index }) => {
		const { locals } = getRequestEvent();
		checkIds(id, parentId ?? []);
		checkIndex(index);
		try { await decks.move(locals.userId, id, parentId ?? null, index ?? null); }
		catch (err) { refused(err); }
	})

// the decks inside it are taken away, their cards kept in it
export const flattenDeck =
	command("unchecked", async ({ id }) => {
		const { locals } = getRequestEvent();
		checkIds(id);
		try { await decks.flatten(locals.userId, id); }
		catch (err) { refused(err); }
	})

export const setInOrder =
	command("unchecked", async ({ id, inOrder }) => {
		const { locals } = getRequestEvent();
		checkIds(id);
		if (typeof inOrder !== "boolean") error(400, "Bad request");
		if (!await decks.setInOrder(locals.userId, id, inOrder)) error(403, "Unauthorized");
	})
