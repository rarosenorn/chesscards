import { error, redirect } from "@sveltejs/kit"
import { building } from "$app/environment"
import { svelteKitHandler } from "better-auth/svelte-kit"
import { auth } from "$lib/server/auth.js"

const handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });
	event.locals.user = session?.user;
	event.locals.userId = session?.user.id;
	event.locals.isAdmin = session?.user.isAdmin ?? false;

	// 404 (not 403) so the panel's existence isn't revealed to non-admins
	if (event.url.pathname.startsWith("/admin") && !event.locals.isAdmin) {
		error(404, "Not Found");
	}

	const authenticatedRoutes = ["/my-flashcards", "/profile"];
	if (authenticatedRoutes.some(r => event.url.pathname.startsWith(r) && !event.locals.userId)) {
		redirect(303, `/login?redirect_to=${event.url.pathname}`);
	}

	const notAuthenticatedRoutes = ["/login", "/register", "/forgot-password"];
	if (notAuthenticatedRoutes.some(r => event.url.pathname === r && event.locals.userId)) {
		redirect(303, "/my-flashcards")
	}

	// mounts better-auth's /api/auth/* endpoints
	return svelteKitHandler({ event, resolve, auth, building });
}

export { handle }
