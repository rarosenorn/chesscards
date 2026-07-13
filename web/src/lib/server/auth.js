import { pool } from "./pool.js"
import argon2 from "argon2" 

// TODO delete sessions after 30 days of non use?
// TODO right now sessions expire after 30 days, I should do something so session refreshes on load or something, figure out best practice
// TODO delete user
// TODO confirm email before create

const createSession = async userId => {
	const { rows } = await pool.query(
		'insert into sessions(user_id) values($1) returning id, user_id "userId", created_at "createdAt";',
		[userId]
	);

	return rows[0];
}
	
const deleteSession = async sessionId => {
	await pool.query("delete from sessions where id = $1", [sessionId]);
}

const authenticateUser = async (email, password) => {
	const { rows } = await pool.query("select id, email, password_hash from users where email = $1", [email]);

	if (!rows[0] || !await argon2.verify(rows[0].password_hash, password)) {
		return null;
	}

	return rows[0];
}

const createUser = async (email, password) => {
	const password_hash = await argon2.hash(password);
	const { rows } = await pool.query(
		'insert into users(email, password_hash) values($1, $2) returning id, email, password_hash "passwordHash";',
		[email, password_hash]
	)

	return rows[0];
}

const getUserIdFromSessionId = async sessionId => {
	const { rows } = await pool.query('select user_id "userId" from sessions where id = $1', [sessionId])

	return rows[0]?.userId;
}

export { createSession, deleteSession, authenticateUser, createUser, getUserIdFromSessionId }
