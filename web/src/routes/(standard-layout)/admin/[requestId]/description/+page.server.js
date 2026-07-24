import { fail, redirect } from "@sveltejs/kit"
import * as marketplace from "$lib/server/marketplace.js"

export const actions = {
	approve: async ({ params }) => {
		try {
			await marketplace.approveUploadRequest(params.requestId);
		} catch (err) {
			if (err.code === "23505") {
				return fail(409, { errors: ["A marketplace deck with this name already exists"] });
			}
			return fail(400, { errors: [err.message] });
		}
		redirect(303, "/admin");
	},
	reject: async ({ params, request }) => {
		const data = await request.formData();
		const reason = data.get("reason")?.toString().trim();
		if (!reason) {
			return fail(400, { errors: ["A rejection reason is required"] });
		}
		if (!await marketplace.rejectUploadRequest(params.requestId, reason)) {
			return fail(400, { errors: ["Request not found or not pending"] });
		}
		redirect(303, "/admin");
	}
}
