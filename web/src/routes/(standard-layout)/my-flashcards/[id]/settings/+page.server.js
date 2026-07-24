import { error, fail, redirect } from "@sveltejs/kit"
import * as decks from "$lib/server/decks.js"
import * as marketplace from "$lib/server/marketplace.js"

export const load = async ({ locals, params, parent }) => {
	// marketplace deck instances are readonly: no settings page for them
	const { deck } = await parent();
	if (deck.isMarketplace) error(404);

	return {
		pageTitle: "Deck",
		uploadRequest: await marketplace.getUploadRequestForDeck(locals.userId, params.id)
	}
}

export const actions = {
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
