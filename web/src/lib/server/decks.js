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
	if (rows[0] && rows[0].cards[0] === null) {
		rows[0].cards = [];
	}

	return rows[0];
}

const getMineWithoutCards = async userId => {
	const { rows } = 
		await pool.query(`select d.id, d.name, count(c.id) no_cards, count(c.id) filter (where c.due <= now() and c.finished_at is null) due_cards from decks d left join cards c on d.id = c.deck_id where d.user_id = $1 group by d.id, d.name`, [userId]
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

// pg returns numeric as string and timestamptz as Date; normalize to the
// shape the json_agg deck load produces (ts-fsrs treats a truthy string
// stability/difficulty as an existing — and invalid — memory state)
const normalizeCard = card => ({
	...card,
	stability: card.stability === null ? null : Number(card.stability),
	difficulty: card.difficulty === null ? null : Number(card.difficulty),
	due: card.due.toISOString(),
	last_review: card.last_review?.toISOString() ?? null
});

// the scheduling columns of a card of this type, in the order the queries
// below list them: a tactic card is due immediately and carries no FSRS state
// (the tactic_cards_have_no_fsrs_state constraint holds it to that)
const scheduleValues = (cardType, FSRSValues) => cardType === "tactic"
	? [new Date(), null, null, null, null, null, null, null, null, null]
	: FSRSValues;

const addCard = async (userId, deckId, front, back, cardType, FSRSValues) => {
	if (!await userIdOwnsDeckId(userId, deckId)) {
		throw new Error("Unauthorized");
	}

	const { rows } = await pool.query(`insert into cards(
			deck_id, front, back, card_type, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, learning_steps, state, last_review
		) values($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
		returning *`, [deckId, front, back, cardType, ...scheduleValues(cardType, FSRSValues)]);

	return normalizeCard(rows[0]);
}

// Switching type restarts the card: the two types keep incompatible
// scheduling (a tactic card has no FSRS state at all), so there is nothing to
// carry across — the review history in review_logs stays, the card's own
// progress does not.
const updateCardType = async (userId, cardId, cardType, FSRSValues) => {
	const { rows } = await pool.query(`
		update cards c set
			card_type = $3, finished_at = null,
			due = $4, stability = $5, difficulty = $6, elapsed_days = $7, scheduled_days = $8,
			reps = $9, lapses = $10, learning_steps = $11, state = $12, last_review = $13
		from decks d
		where c.id = $2 and c.deck_id = d.id and d.user_id = $1
		returning c.*`,
		[userId, cardId, cardType, ...scheduleValues(cardType, FSRSValues)]
	);

	return rows[0] ? normalizeCard(rows[0]) : null;
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

// Every card in the deck back to new — the reset updateCardType performs on a
// single card, applied to the whole deck (and holding each card's own type,
// which is content rather than progress). Review history is untouched: it
// lives in review_logs, keyed by card, and outlives the card's own progress.
// The two statements are the tactic/basic split scheduleValues makes, in
// update form: a tactic card is due immediately and carries no FSRS state.
const resetDeckSchedule = async (userId, deckId, FSRSValues) => {
	const basic = await pool.query(`
		update cards c set
			finished_at = null,
			due = $3, stability = $4, difficulty = $5, elapsed_days = $6, scheduled_days = $7,
			reps = $8, lapses = $9, learning_steps = $10, state = $11, last_review = $12
		from decks d
		where c.deck_id = d.id and d.id = $2 and d.user_id = $1 and c.card_type = 'basic'`,
		[userId, deckId, ...FSRSValues]
	);
	const tactic = await pool.query(`
		update cards c set
			finished_at = null, due = now(),
			stability = null, difficulty = null, elapsed_days = null, scheduled_days = null,
			reps = null, lapses = null, learning_steps = null, state = null, last_review = null
		from decks d
		where c.deck_id = d.id and d.id = $2 and d.user_id = $1 and c.card_type = 'tactic'`,
		[userId, deckId]
	);

	return basic.rowCount + tactic.rowCount;
}

const updateCardStudyState = async (userId, card) => {
	const { rows } = await pool.query(`
		update cards
		set due = $1, stability = $2, difficulty = $3, elapsed_days = $4, scheduled_days = $5, reps = $6, lapses = $7, learning_steps = $8, state = $9, last_review = $10, finished_at = $11
		where id = $12
	`, [card.due, card.stability, card.difficulty, card.elapsed_days, card.scheduled_days, card.reps, card.lapses, card.learning_steps, card.state, card.last_review, card.finished_at ?? null, card.id]
	);
}

const createReviewLog = async (userId, cardId, log) => {
	const { rows } = await pool.query(`
		insert into review_logs(user_id, card_id, rating, state, due, stability, difficulty, elapsed_days, last_elapsed_days, scheduled_days, learning_steps, review)
		values($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`, [userId, cardId, log.rating, log.state, log.due, log.stability, log.difficulty, log.elapsed_days, log.last_elapsed_days, log.scheduled_days, log.learning_steps, log.review])
}

export { create, getMineWithCards, getMineWithoutCards, getById, updateName, remove, addCard, userIdOwnsDeckId, updateCardContent, updateCardType, deleteCards, updateCardStudyState, resetDeckSchedule, createReviewLog }
