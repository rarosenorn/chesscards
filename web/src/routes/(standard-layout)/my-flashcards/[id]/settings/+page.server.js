import { fail, redirect } from "@sveltejs/kit"
import { createEmptyCard } from "ts-fsrs"
import * as decks from "$lib/server/decks.js"
import * as marketplace from "$lib/server/marketplace.js"

export const load = async ({ locals, params, parent }) => {
	// a marketplace deck instance has nothing here but its study progress: the
	// deck's name, cards and marketplace listing are its author's
	const { deck } = await parent();

	return {
		pageTitle: "Deck",
		uploadRequest: deck.isMarketplace
			? null
			: await marketplace.getUploadRequestForDeck(locals.userId, params.id)
	}
}

export const actions = {
	// the id is either a personal deck or a marketplace deck instance, as in
	// the deck layout's load; both resets are scoped to the user by their join
	reset: async ({ params, locals }) => {
		const FSRSValues = Object.values(createEmptyCard());
		const cards = await decks.userIdOwnsDeckId(locals.userId, params.id)
			? await decks.resetDeckSchedule(locals.userId, params.id, FSRSValues)
			: await marketplace.resetInstanceSchedule(locals.userId, params.id, FSRSValues);

		return { cards };
	},
	delete: async ({ request, locals }) => {
		const data = await request.formData();
		await decks.remove(data.get("id"), locals.userId);
		redirect(303, "/my-flashcards");
	},
	rename: async ({ request, locals }) => {
		const data = await request.formData();
		try {
			await decks.updateName(data.get("id"), data.get("name"), locals.userId);
		} catch (err) {
			if (err.code === "23505") {
				return fail(409, {
					name: data.get("name"),
					errors: ["You already have a deck with this name"]
				})
			}
			throw err;
		}
	}
}
