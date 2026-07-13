import { fail, redirect } from "@sveltejs/kit"
import * as auth from "$lib/server/auth.js"
import * as zod from "$lib/zod-schemas.js"

const actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const result = zod.registerUser.safeParse({
			email: data.get("email"),
			password: data.get("password"),
			confirmPassword: data.get("confirm-password")
		});
		if (!result.success) {
			const errArray =
				Object.values(result.error.flatten().fieldErrors).flat();
			return fail(400, { 
            email: data.get("email"),
            errors: errArray 
         })
		}
      let user;
      try {
         user = await auth.createUser(data.get("email"), data.get("password"));
      } catch (err) {
         if (err.code = "23505") {
            return fail(409, {
               errors: ["Email already registered"]
            });
         }
         throw err;
      }
		const session = await auth.createSession(user.id);
		cookies.set("session_id", session.id, {
			secure: true,
			httpOnly: true,
			sameSite: "LAX",
			path: "/",
			maxAge: 60 * 60 * 24 * 30
		});
      redirect(303, "/marketplace");
	}
}

export { actions }
