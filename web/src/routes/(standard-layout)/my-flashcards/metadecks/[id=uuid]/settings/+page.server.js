import { fail, redirect } from "@sveltejs/kit"
import * as metadecks from "$lib/server/metadecks.js"
import * as zod from "$lib/zod-schemas.js"

export const load = () => ({ pageTitle: "Settings" })

export const actions = {
	rename: async ({ params, request, locals }) => {
		const data = await request.formData();
		const result = zod.metadeck.safeParse(data.get("name"));
		if (!result.success) {
			return fail(400, { name: data.get("name"), errors: result.error.flatten().formErrors });
		}
		try {
			await metadecks.rename(locals.userId, params.id, result.data);
		} catch (err) {
			if (err.code === "23505") {
				return fail(409, {
					name: data.get("name"),
					errors: ["You already have a metadeck with this name"]
				})
			}
			throw err;
		}
	},
	order: async ({ params, request, locals }) => {
		const data = await request.formData();
		const order = data.get("value");
		if (order !== "mix" && order !== "in-order") return fail(400, { errors: ["Invalid study order"] });
		await metadecks.setStudyOrder(locals.userId, params.id, order);
	},
	reviews: async ({ params, request, locals }) => {
		const data = await request.formData();
		const value = data.get("value");
		if (value !== "all-first" && value !== "deck-by-deck") return fail(400, { errors: ["Invalid choice"] });
		await metadecks.setReviewsFirst(locals.userId, params.id, value === "all-first");
	},
	delete: async ({ params, locals }) => {
		await metadecks.remove(locals.userId, params.id);
		redirect(303, "/my-flashcards");
	}
}
