import { redirect } from "@sveltejs/kit"
import * as payments from "$lib/server/payments.js"

export const GET = async ({ url, locals }) => {
	const sessionId = url.searchParams.get("session_id");
	if (locals.userId && sessionId) {
		try {
			await payments.fulfillCheckout(sessionId, locals.userId);
		} catch (err) {
			// Stripe's notification records it instead
			console.error("fulfilling on return failed", err);
		}
	}
	redirect(303, "/my-flashcards");
}
