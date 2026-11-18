import { error, fail, redirect } from "@sveltejs/kit"
import * as marketplace from "$lib/server/marketplace.js"

// admin-only: /admin/* is guarded in hooks.server.js
export const load = async ({ params }) => {
	const request = await marketplace.getChangeRequestForReview(params.id);
	if (!request) error(404);
	return { pageTitle: `Changes to ${request.currentName}`, request };
}

export const actions = {
	approve: async ({ params }) => {
		try {
			await marketplace.approveChangeRequest(params.id);
		} catch (err) {
			if (err.code === "23505") {
				return fail(409, { errors: ["A marketplace deck with this name already exists"] });
			}
			return fail(400, { errors: [err.message] });
		}
		redirect(303, "/admin");
	},
	reject: async ({ request, params }) => {
		const reason = (await request.formData()).get("reason")?.toString().trim();
		if (!reason) {
			return fail(400, { errors: ["A rejection reason is required"] });
		}
		if (!await marketplace.rejectChangeRequest(params.id, reason)) {
			return fail(400, { errors: ["Request not found or not pending"] });
		}
		redirect(303, "/admin");
	}
}
