import { fail, redirect } from "@sveltejs/kit"
import * as decks from "$lib/server/decks.js"
import * as marketplace from "$lib/server/marketplace.js"
import * as metadecks from "$lib/server/metadecks.js"
import * as zod from "$lib/zod-schemas.js"
import { DEFAULT_ROLLOVER_HOUR, TZ_COOKIE } from "$lib/rollover.js"

const load = async ({ locals, cookies }) => {
	// the day boundary these counts are read against: the user's hour, in the
	// zone the browser left behind (rollover.js). A first visit has no cookie
	// yet, and falls back to the server's own zone for that one render.
	const when = {
		timeZone: cookies.get(TZ_COOKIE) || Intl.DateTimeFormat().resolvedOptions().timeZone,
		rolloverHour: locals.user?.rolloverHour ?? DEFAULT_ROLLOVER_HOUR
	};
	return {
		decks: await decks.getMineWithoutCards(locals.userId, when),
		marketplaceDecks: await marketplace.getInstancesWithoutCards(locals.userId, when),
		metadecks: await metadecks.getMine(locals.userId),
		pageTitle: "My flashcards"
	}
}

const actions = {
	create: async ({ request, locals }) => {
		const data = await request.formData();
		const result = zod.deck.safeParse(data.get("name"));
		if (!result.success) {
			return fail(400, {
				name: data.get("name"),
				errors: result.error.flatten().formErrors
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
	},
	// a new metadeck holds nothing yet, so it opens on the page that fills it
	createMetadeck: async ({ request, locals }) => {
		const data = await request.formData();
		const result = zod.metadeck.safeParse(data.get("name"));
		if (!result.success) {
			return fail(400, {
				name: data.get("name"),
				errors: result.error.flatten().formErrors
			});
		}
		let metadeck;
		try {
			metadeck = await metadecks.create(locals.userId, data.get("name"));
		} catch (err) {
			if (err.code === "23505") {
				return fail(409, {
					name: data.get("name"),
					errors: ["You already have a metadeck with this name"]
				})
			}
			throw err;
		}
		redirect(303, `/my-flashcards/metadecks/${metadeck.id}/decks`);
	}
}

export { actions, load }
