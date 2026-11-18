import { fail, redirect } from "@sveltejs/kit"
import * as marketplace from "$lib/server/marketplace.js"

export const load = async () => ({
	pageTitle: "Admin",
	requests: await marketplace.getPendingUploadRequests(),
	renames: await marketplace.getPendingRenameRequests()
})

const requestId = async request => (await request.formData()).get("requestId")?.toString() ?? "";

export const actions = {
	approveRename: async ({ request }) => {
		try {
			await marketplace.approveRenameRequest(await requestId(request));
		} catch (err) {
			if (err.code === "23505") {
				return fail(409, { errors: ["A marketplace deck with this name already exists"] });
			}
			return fail(400, { errors: [err.message] });
		}
		redirect(303, "/admin");
	},
	rejectRename: async ({ request }) => {
		const data = await request.formData();
		const reason = data.get("reason")?.toString().trim();
		if (!reason) {
			return fail(400, { errors: ["A rejection reason is required"] });
		}
		if (!await marketplace.rejectRenameRequest(data.get("requestId")?.toString() ?? "", reason)) {
			return fail(400, { errors: ["Request not found or not pending"] });
		}
		redirect(303, "/admin");
	}
}
