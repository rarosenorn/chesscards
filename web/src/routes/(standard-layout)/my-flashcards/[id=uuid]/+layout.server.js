import { error } from "@sveltejs/kit"
import * as decks from "$lib/server/decks.js"
import * as marketplace from "$lib/server/marketplace.js"

const load = async ({ locals, params }) => {
	// the id is either a personal deck or a marketplace deck instance
	const deck = await decks.getById(locals.userId, params.id);
	if (deck) {
		return { deck: { ...deck, isMarketplace: false } };
	}

	const instance = await marketplace.getInstanceById(locals.userId, params.id);
	if (instance) {
		return { deck: { ...instance, isMarketplace: true } };
	}

	error(404);
};

export { load }
