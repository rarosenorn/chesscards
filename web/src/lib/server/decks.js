import { pool } from "./pool.js"

const create = async (userId, name) => {
	const { rows } = await pool.query('insert into decks(user_id, name) values($1, $2) returning id, user_id "userId", name', [userId, name]);

	return rows[0]
}

const getById = async (userId, id) => {
	const { rows } = 
		await pool.query(`
			select d.id, d.name, json_agg(c) cards
			from decks d left join cards c on d.id = c.deck_id 
			where d.user_id = $1 and d.id = $2 
			group by d.id, d.name`, [userId, id]
		);

	// (for using json_agg(json_build_object()) )If deck has no cards, json_build_object builds 1 card with null values - if thats the case, set cards to empty array
	// if (rows[0].cards[0].id === null) {
	// 	rows[0].cards = [];
	// }

	// (for using json_agg(c) ) same reason as above but 1 null element instead
	if (rows[0].cards[0] === null) {
		rows[0].cards = [];
	}

	return rows[0];
}

const getMineWithoutCards = async userId => {
	const { rows } = 
		await pool.query(`select d.id, d.name, count(c.id) no_cards, count(c.id) filter (where c.due <= now()) due_cards from decks d left join cards c on d.id = c.deck_id where d.user_id = $1 group by d.id, d.name`, [userId]
		);

	return rows;
}

const getMineWithCards = async userId => {
	const { rows } =
		await pool.query("select d.id, d.name, json_agg(c) cards from decks d left join cards c on d.id = c.deck_id where d.user_id = $1 group by d.id, d.name", [userId]
		);
	
	// If a deck has no cards, json_build_object builds 1 card with null values - if thats the case, set cards to empty array
	for (let i = 0; i < rows.length; i++) {
		if (rows[i].cards[0].id === null) {
			rows[i].cards = []
		}
	}

	return rows;
}

const updateName = async (id, name, userId) => {
	const { rows } = await pool.query(`update decks set name = $2 where id = $1 and user_id = $3 returning id, name, user_id "userId"`, [id, name, userId]);

	return rows[0];
}

const userIdOwnsDeckId = async (userId, deckId) => {
	const { rowCount } = await pool.query("select id from decks where id = $1 and user_id = $2", [deckId, userId]);

	return rowCount === 1
}

const remove = async (id, userId) => {
	const { rowCount } = await pool.query("delete from decks where id = $1 and user_id = $2", [id, userId]);

	return rowCount === 1;
}

const addCard = async (userId, deckId, front, back, FSRSValues) => {
	if (!await userIdOwnsDeckId(userId, deckId)) {
		throw new Error("Unauthorized");
	}

	const { rows } = await pool.query(`insert into cards(
			deck_id, front, back, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, learning_steps, state, last_review
		) values($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
		returning *`, [deckId, front, back, ...FSRSValues]);

	return rows[0];
}

const updateCardContent = async (userId, cardId, front, back) => {
	const { rowCount } = await pool.query(`
		update cards c set front = $3, back = $4
		from decks d
		where c.id = $2 and c.deck_id = d.id and d.user_id = $1`,
		[userId, cardId, front, back]
	);

	return rowCount === 1;
}

const deleteCards = async (userId, cardIds) => {
	const { rowCount } = await pool.query(`
		delete from cards c
		using decks d
		where c.id = any($2::uuid[]) and c.deck_id = d.id and d.user_id = $1`,
		[userId, cardIds]
	);

	return rowCount;
}

const updateCardStudyState = async (userId, card) => {
	const { rows } = await pool.query(`
		update cards 
		set due = $1, stability = $2, difficulty = $3, elapsed_days = $4, scheduled_days = $5, reps = $6, lapses = $7, learning_steps = $8, state = $9, last_review = $10
		where id = $11
	`, [card.due, card.stability, card.difficulty, card.elapsed_days, card.scheduled_days, card.reps, card.lapses, card.learning_steps, card.state, card.last_review, card.id]
	);
}

const createReviewLog = async (userId, cardId, log) => {
	const { rows } = await pool.query(`
		insert into review_logs(user_id, card_id, rating, state, due, stability, difficulty, elapsed_days, last_elapsed_days, scheduled_days, learning_steps, review)
		values($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`, [userId, cardId, log.rating, log.state, log.due, log.stability, log.difficulty, log.elapsed_days, log.last_elapsed_days, log.scheduled_days, log.learning_steps, log.review])
}

export { create, getMineWithCards, getMineWithoutCards, getById, updateName, remove, addCard, userIdOwnsDeckId, updateCardContent, deleteCards, updateCardStudyState, createReviewLog }
