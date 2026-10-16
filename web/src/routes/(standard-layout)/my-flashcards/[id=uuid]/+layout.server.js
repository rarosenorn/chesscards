import { error } from "@sveltejs/kit"
import * as decks from "$lib/server/decks.js"

// The id is any deck of the user's library: one of their own, a marketplace
// deck they have taken, or a deck inside one (decks.getDeck).
const load = async ({ locals, params }) => {
	const deck = await decks.getDeck(locals.userId, params.id);
	if (!deck) error(404);
	return { deck };
};

export { load }
