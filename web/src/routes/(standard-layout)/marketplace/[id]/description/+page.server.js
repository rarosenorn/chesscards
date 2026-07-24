import { fail, redirect } from "@sveltejs/kit"
import * as marketplace from "$lib/server/marketplace.js"

export const actions = {
	getDeck: async ({ params, locals, url }) => {
		if (!locals.userId) {
			redirect(303, `/login?redirect_to=${url.pathname}`);
		}
		try {
			await marketplace.createDeckInstance(locals.userId, params.id);
		} catch (err) {
			return fail(400, { errors: [err.message] });
		}
		redirect(303, "/my-flashcards");
	}
}
