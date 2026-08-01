import { pool } from "./pool.js"

// a deck is born with its Stage 1: every card belongs to a stage, so there is
// always one to put the first card in
const create = async (userId, name) => {
	const { rows } = await pool.query(`
		with d as (insert into decks(user_id, name) values($1, $2) returning id, user_id, name),
		s as (insert into stages(deck_id, position) select id, 1 from d)
		select id, user_id "userId", name from d`, [userId, name]);

	return rows[0]
}

const getById = async (userId, id) => {
	const { rows } =
		await pool.query(`
			select d.id, d.name, d.stage_progression "stageProgression",
				coalesce((select json_agg(json_build_object('id', s.id, 'name', s.name, 'position', s.position) order by s.position)
					from stages s where s.deck_id = d.id), '[]'::json) stages,
				coalesce((select json_agg(to_jsonb(c) order by s.position, c.position)
					from cards c join stages s on s.id = c.stage_id where c.deck_id = d.id), '[]'::json) cards
			from decks d
			where d.user_id = $1 and d.id = $2`, [userId, id]
		);

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

// the card lands at the end of the given stage — or of the deck's last stage
// when none is named (the trial editors have no picker)
const addCard = async (userId, deckId, front, back, cardType, FSRSValues, stageId = null) => {
	if (!await userIdOwnsDeckId(userId, deckId)) {
		throw new Error("Unauthorized");
	}

	const { rows } = await pool.query(`insert into cards(
			deck_id, stage_id, position, front, back, card_type, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, learning_steps, state, last_review
		)
		select $1, s.id, coalesce((select max(position) from cards where stage_id = s.id), 0) + 1,
			$3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
		from stages s
		where s.deck_id = $1 and ($2::uuid is null or s.id = $2)
		order by s.position desc limit 1
		returning *`, [deckId, stageId, front, back, cardType, ...scheduleValues(cardType, FSRSValues)]);

	if (!rows[0]) throw new Error("Unauthorized");
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

// --- stages ---
// Positions (stages in a deck, cards in a stage) are kept dense 1..n here, so
// the client can show "2.17" straight off the stored numbers. Every op ends
// by renumbering what it disturbed.

const renumberCards = (client, deckId) => client.query(`
	with numbered as (
		select c.id, row_number() over (partition by c.stage_id order by c.position) rn
		from cards c where c.deck_id = $1
	)
	update cards c set position = n.rn from numbered n where c.id = n.id and c.position <> n.rn`,
	[deckId]
);

const createStage = async (userId, deckId, name) => {
	const { rows } = await pool.query(`
		insert into stages(deck_id, name, position)
		select d.id, $3, coalesce((select max(position) from stages where deck_id = d.id), 0) + 1
		from decks d where d.id = $2 and d.user_id = $1
		returning id, name, position`, [userId, deckId, name]);

	return rows[0];
}

const renameStage = async (userId, stageId, name) => {
	const { rowCount } = await pool.query(`
		update stages s set name = $3
		from decks d where s.id = $2 and s.deck_id = d.id and d.user_id = $1`,
		[userId, stageId, name]);

	return rowCount === 1;
}

// A deck keeps at least one stage. Deleting one hands its cards, in order, to
// the end of the previous stage (the next one, for the first stage): the
// cards' progress is theirs, only the grouping goes.
const deleteStage = async (userId, stageId) => {
	const client = await pool.connect();
	try {
		await client.query("begin");
		const { rows: [stage] } = await client.query(`
			select s.id, s.deck_id, s.position from stages s
			join decks d on d.id = s.deck_id
			where s.id = $2 and d.user_id = $1 for update`, [userId, stageId]);
		if (!stage) throw new Error("Unauthorized");
		const { rows: [neighbor] } = await client.query(`
			select id from stages where deck_id = $1 and id <> $2
			order by (position < $3) desc, abs(position - $3) limit 1`,
			[stage.deck_id, stageId, stage.position]);
		if (!neighbor) throw new Error("A deck keeps at least one stage");
		// the update's snapshot holds max() still while rows move in under it
		await client.query(`
			update cards set stage_id = $2,
				position = position + coalesce((select max(position) from cards where stage_id = $2), 0)
			where stage_id = $1`, [stageId, neighbor.id]);
		await client.query("delete from stages where id = $1", [stageId]);
		await client.query(`
			with numbered as (select id, row_number() over (order by position) rn from stages where deck_id = $1)
			update stages s set position = n.rn from numbered n where s.id = n.id and s.position <> n.rn`,
			[stage.deck_id]);
		await renumberCards(client, stage.deck_id);
		await client.query("commit");
	} catch (err) {
		await client.query("rollback");
		throw err;
	} finally {
		client.release();
	}
}

// The one write behind every reordering gesture — a drag, a typed "3.3", a
// context-menu move: the given cards leave where they were and sit down, in
// the given order, at index (0-based; null appends) of the target stage. The
// whole deck's layout is recomputed here and written in one statement.
const moveCards = async (userId, deckId, cardIds, targetStageId, targetIndex) => {
	const client = await pool.connect();
	try {
		await client.query("begin");
		const { rows: stages } = await client.query(`
			select s.id from stages s join decks d on d.id = s.deck_id
			where d.id = $2 and d.user_id = $1 order by s.position for update`,
			[userId, deckId]);
		if (!stages.some(s => s.id === targetStageId)) throw new Error("Unauthorized");
		const { rows: cards } = await client.query(
			"select id, stage_id from cards where deck_id = $1 order by position", [deckId]);
		const deckCardIds = new Set(cards.map(c => c.id));
		if (!cardIds.every(id => deckCardIds.has(id))) throw new Error("Unauthorized");

		const moving = new Set(cardIds);
		const byStage = new Map(stages.map(s => [s.id, []]));
		for (const card of cards) {
			if (!moving.has(card.id)) byStage.get(card.stage_id).push(card.id);
		}
		const target = byStage.get(targetStageId);
		const index = Math.max(0, Math.min(targetIndex ?? target.length, target.length));
		target.splice(index, 0, ...cardIds);

		const ids = [], stageIds = [], positions = [];
		for (const [stageId, list] of byStage) {
			list.forEach((id, i) => { ids.push(id); stageIds.push(stageId); positions.push(i + 1); });
		}
		await client.query(`
			update cards c set stage_id = u.stage_id, position = u.position
			from unnest($1::uuid[], $2::uuid[], $3::smallint[]) u(id, stage_id, position)
			where c.id = u.id`, [ids, stageIds, positions]);
		await client.query("commit");
	} catch (err) {
		await client.query("rollback");
		throw err;
	} finally {
		client.release();
	}
}

// touching a single deck's toggle also puts the profile's three-way back to
// "per deck" — the bulk modes only mean anything until the next exception
const updateStageProgression = async (userId, deckId, value) => {
	const { rowCount } = await pool.query(
		"update decks set stage_progression = $3 where id = $2 and user_id = $1",
		[userId, deckId, value]);
	if (rowCount === 1) {
		await pool.query(`update "user" set "stageProgressionMode" = 'per-deck' where id = $1`, [userId]);
	}

	return rowCount === 1;
}

const getStageProgressionMode = async userId => {
	const { rows } = await pool.query(
		'select "stageProgressionMode" mode from "user" where id = $1', [userId]);

	return rows[0]?.mode;
}

// 'all'/'none' are bulk writes over every deck and instance the user studies;
// 'per-deck' just hands control back to the decks' own flags as they stand
const setStageProgressionMode = async (userId, mode) => {
	await pool.query('update "user" set "stageProgressionMode" = $2 where id = $1', [userId, mode]);
	if (mode === "per-deck") return;
	const value = mode === "all";
	await pool.query("update decks set stage_progression = $2 where user_id = $1", [userId, value]);
	await pool.query("update marketplace_deck_instances set stage_progression = $2 where user_id = $1", [userId, value]);
}

const createReviewLog = async (userId, cardId, log) => {
	const { rows } = await pool.query(`
		insert into review_logs(user_id, card_id, rating, state, due, stability, difficulty, elapsed_days, last_elapsed_days, scheduled_days, learning_steps, review)
		values($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`, [userId, cardId, log.rating, log.state, log.due, log.stability, log.difficulty, log.elapsed_days, log.last_elapsed_days, log.scheduled_days, log.learning_steps, log.review])
}

export { create, getMineWithCards, getMineWithoutCards, getById, updateName, remove, addCard, userIdOwnsDeckId, updateCardContent, updateCardType, deleteCards, updateCardStudyState, resetDeckSchedule, createReviewLog, createStage, renameStage, deleteStage, moveCards, updateStageProgression, getStageProgressionMode, setStageProgressionMode }
