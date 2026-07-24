import { fail } from "@sveltejs/kit"
import * as decks from "$lib/server/decks.js"
import * as marketplace from "$lib/server/marketplace.js"
import * as zod from "$lib/zod-schemas.js"

const load = async ({ locals }) => {
	return {
		decks: await decks.getMineWithoutCards(locals.userId),
		marketplaceDecks: await marketplace.getInstancesWithoutCards(locals.userId),
		pageTitle: "My flashcards"
	}
}

const actions = {
	create: async ({ request, locals }) => {
		const data = await request.formData();
		const result = zod.deck.safeParse(data.get("name"));
		if (!result.success) {
			const errArray =
				Object.values(result.error.flatten().fieldErrors).flat();
			return fail(400, {
				name: data.get("name"),
				errors: errArray
			});
		}
		try {
			await decks.create(locals.userId, data.get("name"));
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

export { actions, load }
