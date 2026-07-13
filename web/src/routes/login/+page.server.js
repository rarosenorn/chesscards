import { fail, redirect } from "@sveltejs/kit"
import * as auth from "$lib/server/auth.js"

export const actions = {
	default: async ({ request, cookies, url }) => {
		const data = await request.formData();
		const user = await auth.authenticateUser(data.get("email"), data.get("password"));
		if (!user) {
			return fail(401, {
				email: data.get("email"),
				errors: ["Invalid email or password"]
			});
		}
		const session = await auth.createSession(user.id);

		cookies.set("session_id", session.id, { 
			secure: true, 
			httpOnly: true,
			maxAge: 60 * 60 * 24 * 30,
			sameSite: "LAX",
			path: "/"
		});

		// If redirected from protected route to login, a redirectTo query param
		// back to the redirected from url is included, so that when logging in 
		// it takes you back to their originally requested page. If not redirected
		// it takes you to my-flashcards
		redirect(303, url.searchParams.get("redirect_to") ?? "my-flashcards");
	}
}
