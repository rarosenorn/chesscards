import { error, redirect } from "@sveltejs/kit"
import { building } from "$app/environment"
import { svelteKitHandler } from "better-auth/svelte-kit"
import { auth } from "$lib/server/auth.js"

const handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });
	event.locals.user = session?.user;
	event.locals.userId = session?.user.id;
	event.locals.twoFactorVerified = session?.session.twoFactorVerified ?? false;
	event.locals.isAdmin = Boolean(session?.user.isAdmin && event.locals.twoFactorVerified);

	// 404 (not 403) so the panel's existence isn't revealed to non-admins
	if (event.url.pathname.startsWith("/admin") && !event.locals.isAdmin) {
		if (session?.user.isAdmin) redirect(303, "/profile#two-factor");
		error(404, "Not Found");
	}

	// whole path segments: /author is the author's own, /author-terms is public
	const authenticatedRoutes = ["/my-flashcards", "/profile", "/author"];
	const under = route => event.url.pathname === route || event.url.pathname.startsWith(route + "/");
	if (authenticatedRoutes.some(under) && !event.locals.userId) {
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
