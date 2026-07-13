import { pool } from "$lib/server/pool.js"

const load = async ({ cookies }) => {
	const sessionId = cookies.get("session_id");

	if (!sessionId) {
		return;
	}

	const { rows: [session] }= await pool.query("select user_id from sessions where id = $1", [sessionId]);

	if (!session) {
		cookies.delete("session_id", {
         path: "/"
      });
		return;
	}

	const { rows: [user] } = await pool.query("select email from users where id = $1", [session.user_id]);

	return {
		user: {
			email: user.email
		}
	}
}


export { load }
