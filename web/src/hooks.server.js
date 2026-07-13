import { redirect } from "@sveltejs/kit"
import * as auth from "$lib/server/auth.js"

const handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get("session_id");
	if (sessionId) {
		event.locals.userId = await auth.getUserIdFromSessionId(sessionId);

		if (!event.locals.userId) {
			event.cookies.delete("session_id", { path: "/" });
		}
	}

	const authenticatedRoutes = ["/my-flashcards"];
	if (authenticatedRoutes.some(r => event.url.pathname.startsWith(r) && !event.locals.userId)) {
		redirect(303, `/login?redirect_to=${event.url.pathname}`);
	}

	const notAuthenticatedRoutes = ["/login", "/register"];
	if (notAuthenticatedRoutes.some(r => event.url.pathname === r && event.locals.userId)) {
		redirect(303, "/my-flashcards")
	}

	return resolve(event);
}



export { handle }
