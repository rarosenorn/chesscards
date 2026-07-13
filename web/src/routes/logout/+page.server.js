import { redirect } from "@sveltejs/kit"
import * as auth from "$lib/server/auth.js"

const actions = {
	default: async ({ cookies }) => {
		const sessionId = cookies.get("session_id");
		try {
			await auth.deleteSession(sessionId);
		} catch (err) {
			console.error("Failed to delete session from db", err);
		}
		cookies.delete("session_id", {
			path: "/"
		})
		redirect(303, "/");
	}
}

export { actions }
