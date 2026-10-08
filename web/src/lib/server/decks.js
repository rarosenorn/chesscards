import { pool } from "./pool.js"
import { childrenByParent, subdeckOrder, leafSubdecks, subdeckSubtree } from "../subdecks.js"

// a deck is born with its Subdeck 1: every card belongs to a subdeck, so there is
// always one to put the first card in. Subdecks are named, so the first one
// carries the name the user would have typed anyway.
const FIRST_SUBDECK_NAME = "Subdeck 1";

const create = async (userId, name) => {
	const { rows } = await pool.query(`
		with d as (insert into decks(user_id, name, position)
			values($1, $2, (select coalesce(max(position), 0) + 1 from decks where user_id = $1))
			returning id, user_id, name),
		s as (insert into subdecks(deck_id, name, position) select id, $3, 1 from d)
		select id, user_id "userId", name from d`, [userId, name, FIRST_SUBDECK_NAME]);

	return rows[0]
}

// A deck with its subdecks (a tree: see lib/subdecks.js) and its cards, the
// cards in the deck's reading order
const getById = async (userId, id) => {
	const { rows } =
		await pool.query(`
			select d.id, d.name, d.uses_subdecks "usesSubdecks", d.progression_depth "progressionDepth",
				coalesce((select json_agg(json_build_object('id', s.id, 'parent_id', s.parent_id, 'name', s.name, 'position', s.position) order by s.position)
					from subdecks s where s.deck_id = d.id), '[]'::json) subdecks,
				coalesce((select json_agg(to_jsonb(c)) from cards c where c.deck_id = d.id), '[]'::json) cards
			from decks d
			where d.user_id = $1 and d.id = $2`, [userId, id]
		);
	if (rows[0]) inDeckOrder(rows[0]);

	return rows[0];
}

// a deck's cards put in its reading order: subdeck by subdeck as the tree reads,
// then by their place in the subdeck
const inDeckOrder = deck => {
	const order = subdeckOrder(deck.subdecks);
	deck.cards.sort((a, b) => order.get(a.subdeck_id) - order.get(b.subdeck_id) || a.position - b.position);
}

// Due and still in play — the shared condition behind every count below, and
// the SQL twin of isDueAt (lib/rollover.js). An interval of a day or more is
// read against the day boundary rather than the clock time it was graded at,
// so a card graded at 10pm is waiting at 4am; the short learning steps keep
// their exact times. bounds.day_end is the end of the rollover day we are in.
const DUE = `c.finished_at is null and (
	c.due <= now()
	or (c.last_review is not null
		and c.due - c.last_review >= interval '1 day'
		and c.due < bounds.day_end)
)`;

// The end of the current rollover day, from the user's hour ($3) and the zone
// the browser left in a cookie ($2) — the server renders these counts and has
// no one to ask. Subtracting the hour before truncating is what puts the small
// hours in the previous day: at 1am the day started at 4am YESTERDAY.
const BOUNDS = `select ((
	date_trunc('day', (now() at time zone $2) - make_interval(hours => $3))
		+ make_interval(hours => $3) + interval '1 day'
) at time zone $2) day_end`;

const getMineWithoutCards = async (userId, { timeZone, rolloverHour }) => {
	const { rows } =
		await pool.query(`with bounds as (${BOUNDS})
			select d.id, d.name,
			count(c.id) filter (where ${DUE}) due_cards,
			-- the deck list's anki columns. A tactic card carries no FSRS
			-- state, so its last_review stands in: never answered is new,
			-- otherwise it is a card coming round again (no learning step)
			count(c.id) filter (where ${DUE} and (c.state = 0 or (c.state is null and c.last_review is null))) new_cards,
			count(c.id) filter (where ${DUE} and c.state in (1, 3)) learn_cards,
			count(c.id) filter (where ${DUE} and (c.state = 2 or (c.state is null and c.last_review is not null))) review_cards
			from decks d left join cards c on d.id = c.deck_id cross join bounds
			where d.user_id = $1 group by d.id, d.name order by d.position`,
			[userId, timeZone, rolloverHour]
		);

	return rows;
}

// The user's decks in the order given: ids must be exactly their decks, or
// nothing moves (a stale list from another tab would drop some off the end)
const reorder = async (userId, ids) => {
	const { rowCount } = await pool.query(`
		update decks d set position = u.n
		from unnest($2::uuid[]) with ordinality u(id, n)
		where d.id = u.id and d.user_id = $1
			and (select count(*) from decks where user_id = $1) = cardinality($2::uuid[])`,
		[userId, ids]);

	return rowCount === ids.length;
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

// The deck's own listing for its Deck tab, shaped like a marketplace deck's.
// The image itself goes out through the deck's thumbnail route; only a hash
// of it travels here, for the tab to put in that route's url
const getListing = async (userId, id) => {
	const { rows } = await pool.query(`
		select d.id, d.name, d.description, d.theme, left(md5(d.image), 8) "imageVersion", u.name author,
			d.preview_card_ids "previewCardIds",
			(select count(*) from cards c where c.deck_id = d.id)::int "cardCount"
		from decks d
		join "user" u on u.id = d.user_id
		where d.user_id = $1 and d.id = $2`,
		[userId, id]
	);

	return rows[0];
}

const getImage = async (userId, id) => {
	const { rows } = await pool.query(
		'select image, image_type "imageType" from decks where user_id = $1 and id = $2 and image is not null',
		[userId, id]
	);

	return rows[0];
}

// a null image keeps the one the deck has. The description goes as JSON
// text: pg would send its blocks array as a postgres array
const updateListing = async (userId, id, { name, description, theme, image, imageType }) => {
	const { rowCount } = await pool.query(`
		update decks set name = $3, description = $4, theme = $5,
			image = coalesce($6, image), image_type = coalesce($7, image_type)
		where user_id = $1 and id = $2`,
		[userId, id, name, description && JSON.stringify(description), theme, image, imageType]
	);

	return rowCount === 1;
}

// the deck's sample cards, in the given order; ids that are not the deck's
// cards are dropped
const updatePreviewCards = async (userId, id, cardIds) => {
	const { rowCount } = await pool.query(`
		update decks d set preview_card_ids = array(
			select c.id from unnest($3::uuid[]) with ordinality ids(id, n)
			join cards c on c.id = ids.id and c.deck_id = d.id
			order by ids.n
		)
		where d.user_id = $1 and d.id = $2`,
		[userId, id, cardIds]
	);

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

// the card lands at the end of the given subdeck — or of the deck's last subdeck
// when none is named (the trial editors have no picker)
// One card, at the end of the named subdeck — or of the deck's last one that
// holds cards, when none is named or the named one cannot take it.
const addCard = async (userId, deckId, front, back, cardType, FSRSValues, subdeckId = null) => {
	const client = await pool.connect();
	try {
		await client.query("begin");
		const subdeck = await landingSubdeck(client, userId, deckId, subdeckId);
		const { rows } = await client.query(`insert into cards(
				deck_id, subdeck_id, position, front, back, card_type, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, learning_steps, state, last_review
			) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
			returning *`, [deckId, subdeck.id, subdeck.last + 1, front, back, cardType, ...scheduleValues(cardType, FSRSValues)]);
		await client.query("commit");
		return normalizeCard(rows[0]);
	} catch (err) {
		await client.query("rollback");
		throw err;
	} finally {
		client.release();
	}
}

// Several basic cards at once, in the order given, at the end of the named
// subdeck — or of the deck's last one, when none is named or the named one has
// gone since. All of them or none.
const addCards = async (userId, deckId, subdeckId, cards, FSRSValues) => {
	const client = await pool.connect();
	try {
		await client.query("begin");
		const subdeck = await landingSubdeck(client, userId, deckId, subdeckId);
		const ids = [];
		for (const [index, card] of cards.entries()) {
			const { rows } = await client.query(`insert into cards(
					deck_id, subdeck_id, position, front, back, card_type, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, learning_steps, state, last_review
				) values ($1, $2, $3, $4, $5, 'basic', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
				returning id`,
				[deckId, subdeck.id, subdeck.last + index + 1, JSON.stringify(card.front), JSON.stringify(card.back), ...FSRSValues]);
			ids.push(rows[0].id);
		}
		await client.query("commit");
		return ids;
	} catch (error) {
		await client.query("rollback");
		throw error;
	} finally {
		client.release();
	}
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

// --- subdecks ---
// Positions (subdecks in a deck, cards in a subdeck) are kept dense 1..n here, so
// the client can show "2.17" straight off the stored numbers. Every op ends
// by renumbering what it disturbed.

// The deck's subdecks, locked for the write that follows. Throws unless the
// deck is the user's (a deck always has at least one subdeck).
const lockSubdecks = async (client, userId, deckId) => {
	const { rows } = await client.query(`
		select s.id, s.parent_id, s.name, s.position
		from subdecks s join decks d on d.id = s.deck_id
		where d.id = $2 and d.user_id = $1
		order by s.position for update of s`, [userId, deckId]);
	if (rows.length === 0) throw new Error("Unauthorized");
	return rows;
}

// A subdeck holds cards or subdecks, never both. So before one that holds
// cards takes its first subdeck, the cards move into a subdeck of their own
// inside it, named Temp for the user to rename or empty. Answers with that
// subdeck, or null when there were no cards to rehouse.
const TEMP_NAME = "Temp";
const rehouseCards = async (client, deckId, subdeckId) => {
	const { rowCount } = await client.query("select 1 from cards where subdeck_id = $1 limit 1", [subdeckId]);
	if (rowCount === 0) return null;
	const { rows: [temp] } = await client.query(`
		insert into subdecks(deck_id, parent_id, name, position) values ($1, $2, $3, 1)
		returning id, parent_id, name, position`, [deckId, subdeckId, TEMP_NAME]);
	await client.query("update cards set subdeck_id = $2 where subdeck_id = $1", [subdeckId, temp.id]);
	return temp;
}

// siblings numbered 1..n in the order given
const numberSubdecks = (client, siblings) => client.query(`
	update subdecks s set position = u.n
	from unnest($1::uuid[]) with ordinality u(id, n)
	where s.id = u.id and s.position <> u.n`, [siblings.map(subdeck => subdeck.id)]);

// A plain deck takes its first subdeck, and from here on uses them. Its
// cards have been sitting in the one subdeck every deck keeps, unseen. With
// cards in it, that one comes into view beside the new subdeck, as Temp
// unless it carries a name of its own (cards and subdecks never share a
// level, the deck's own included); empty, it simply becomes the new subdeck.
// A deck whose subdecks were hidden rather than never made has them come
// back as they were.
const firstSubdeck = async (client, deckId, subdecks, name) => {
	await client.query("update decks set uses_subdecks = true where id = $1", [deckId]);
	if (subdecks.length === 1) {
		const [unseen] = subdecks;
		const { rowCount: holdsCards } = await client.query(
			"select 1 from cards where subdeck_id = $1 limit 1", [unseen.id]);
		if (!holdsCards || unseen.name === FIRST_SUBDECK_NAME) {
			await client.query("update subdecks set name = $2 where id = $1", [unseen.id, holdsCards ? TEMP_NAME : name]);
		}
		if (!holdsCards) return { ...unseen, name };
	}
	const { rows } = await client.query(`
		insert into subdecks(deck_id, name, position) values ($1, $2, $3)
		returning id, parent_id, name, position`,
		[deckId, name, (childrenByParent(subdecks).get(null) ?? []).length + 1]);
	return rows[0];
}

// A new subdeck at the end of the deck's top level, or of the subdeck named
// as its parent (whose cards, if it holds any, are rehoused first). On a
// deck that has not used subdecks so far, it is the deck's first.
const createSubdeck = async (userId, deckId, name, parentId = null) => {
	const client = await pool.connect();
	try {
		await client.query("begin");
		const subdecks = await lockSubdecks(client, userId, deckId);
		if (parentId && !subdecks.some(subdeck => subdeck.id === parentId)) throw new Error("Unauthorized");
		const { rows: [deck] } = await client.query("select uses_subdecks from decks where id = $1", [deckId]);
		if (!deck.uses_subdecks) {
			if (parentId) throw new Error("Unauthorized");
			const first = await firstSubdeck(client, deckId, subdecks, name);
			await client.query("commit");
			return first;
		}
		const siblings = childrenByParent(subdecks).get(parentId) ?? [];
		const temp = parentId && siblings.length === 0 ? await rehouseCards(client, deckId, parentId) : null;
		const { rows } = await client.query(`
			insert into subdecks(deck_id, parent_id, name, position) values ($1, $2, $3, $4)
			returning id, parent_id, name, position`,
			[deckId, parentId, name, siblings.length + (temp ? 1 : 0) + 1]);
		await client.query("commit");
		return rows[0];
	} catch (err) {
		await client.query("rollback");
		throw err;
	} finally {
		client.release();
	}
}

const renameSubdeck = async (userId, subdeckId, name) => {
	const { rowCount } = await pool.query(`
		update subdecks s set name = $3
		from decks d where s.id = $2 and s.deck_id = d.id and d.user_id = $1`,
		[userId, subdeckId, name]);

	return rowCount === 1;
}

// A subdeck moves, with everything inside it, to sit at index (0-based; null
// appends) among the subdecks of parentId — the deck's top level when that
// is null. Never into itself or anything inside it. A parent that holds
// cards has them rehoused first, as when a subdeck is created in it.
const moveSubdeck = async (userId, deckId, subdeckId, parentId, index) => {
	const client = await pool.connect();
	try {
		await client.query("begin");
		const subdecks = await lockSubdecks(client, userId, deckId);
		const moving = subdecks.find(subdeck => subdeck.id === subdeckId);
		if (!moving) throw new Error("Unauthorized");
		if (parentId && !subdecks.some(subdeck => subdeck.id === parentId)) throw new Error("Unauthorized");
		if (parentId && subdeckSubtree(subdecks, subdeckId).has(parentId)) throw new Error("A subdeck cannot go inside itself");

		const children = childrenByParent(subdecks);
		const from = moving.parent_id ?? null;
		const left = (children.get(from) ?? []).filter(subdeck => subdeck.id !== subdeckId);
		const joined = from === parentId ? left : [...(children.get(parentId) ?? [])];
		if (parentId && joined.length === 0 && from !== parentId) {
			const temp = await rehouseCards(client, deckId, parentId);
			if (temp) joined.push(temp);
		}
		joined.splice(Math.max(0, Math.min(index ?? joined.length, joined.length)), 0, moving);

		await client.query("update subdecks set parent_id = $2 where id = $1", [subdeckId, parentId]);
		await numberSubdecks(client, joined);
		if (from !== parentId) await numberSubdecks(client, left);
		await client.query("commit");
	} catch (err) {
		await client.query("rollback");
		throw err;
	} finally {
		client.release();
	}
}

// The subdecks inside a subdeck are taken away and their cards stay: every
// card under it, in reading order, becomes a card of the subdeck itself.
// Without a subdeck named it is the whole deck that is flattened, into the
// plain list a deck without subdecks is: the cards gather in its first
// subdeck, which stays on unseen as the one every deck keeps (under the name
// a new deck's has, so a later first subdeck finds them in Temp).
const flattenSubdecks = async (userId, deckId, subdeckId = null) => {
	const client = await pool.connect();
	try {
		await client.query("begin");
		const subdecks = await lockSubdecks(client, userId, deckId);
		const keeper = subdeckId
			? subdecks.find(subdeck => subdeck.id === subdeckId)
			: (childrenByParent(subdecks).get(null) ?? [])[0];
		if (!keeper) throw new Error("Unauthorized");
		const going = subdeckId ? subdeckSubtree(subdecks, subdeckId) : new Set(subdecks.map(subdeck => subdeck.id));
		going.delete(keeper.id);
		const { rows: cards } = await client.query(
			"select id, subdeck_id, position from cards where subdeck_id = any($1::uuid[])", [[keeper.id, ...going]]);
		inDeckOrder({ subdecks, cards });
		await client.query(`
			update cards c set subdeck_id = $1, position = u.n
			from unnest($2::uuid[]) with ordinality u(id, n)
			where c.id = u.id`, [keeper.id, cards.map(card => card.id)]);
		await client.query("delete from subdecks where id = any($1::uuid[])", [[...going]]);
		if (!subdeckId) {
			await client.query("update subdecks set name = $2, position = 1 where id = $1", [keeper.id, FIRST_SUBDECK_NAME]);
			await client.query("update decks set uses_subdecks = false where id = $1", [deckId]);
		}
		await client.query("commit");
	} catch (err) {
		await client.query("rollback");
		throw err;
	} finally {
		client.release();
	}
}

// A subdeck goes with everything inside it: its subdecks, and every card
// under it with its review history (the caller has asked the user first).
// When the last one goes the deck stops using subdecks: it is a plain list
// again, with the one unseen subdeck every deck keeps for its cards to sit
// in (fresh and empty, as a new deck is born with).
const deleteSubdeck = async (userId, subdeckId) => {
	const client = await pool.connect();
	try {
		await client.query("begin");
		const { rows: [found] } = await client.query(`
			select s.deck_id from subdecks s join decks d on d.id = s.deck_id
			where s.id = $2 and d.user_id = $1`, [userId, subdeckId]);
		if (!found) throw new Error("Unauthorized");
		const subdecks = await lockSubdecks(client, userId, found.deck_id);
		const going = subdeckSubtree(subdecks, subdeckId);
		const { rows: cards } = await client.query(
			"delete from cards where subdeck_id = any($1::uuid[]) returning id", [[...going]]);
		await client.query(`
			update decks set preview_card_ids = array(
				select id from unnest(preview_card_ids) with ordinality p(id, n)
				where id <> all($2::uuid[]) order by n)
			where id = $1`, [found.deck_id, cards.map(card => card.id)]);
		// its subdecks go with it (parent_id cascades)
		await client.query("delete from subdecks where id = $1", [subdeckId]);
		const deleted = subdecks.find(subdeck => subdeck.id === subdeckId);
		await numberSubdecks(client, (childrenByParent(subdecks).get(deleted.parent_id ?? null) ?? [])
			.filter(subdeck => subdeck.id !== subdeckId));
		if (subdecks.every(subdeck => going.has(subdeck.id))) {
			await client.query(
				"insert into subdecks(deck_id, name, position) values ($1, $2, 1)", [found.deck_id, FIRST_SUBDECK_NAME]);
			await client.query("update decks set uses_subdecks = false where id = $1", [found.deck_id]);
		}
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
// the given order, at index (0-based; null appends) of the target subdeck,
// which has to be one that holds cards. The whole deck's layout is recomputed
// here and written in one statement.
const moveCards = async (userId, deckId, cardIds, targetSubdeckId, targetIndex) => {
	const client = await pool.connect();
	try {
		await client.query("begin");
		const subdecks = await lockSubdecks(client, userId, deckId);
		if (!leafSubdecks(subdecks).some(s => s.id === targetSubdeckId)) throw new Error("Unauthorized");
		const { rows: cards } = await client.query(
			"select id, subdeck_id from cards where deck_id = $1 order by position", [deckId]);
		const deckCardIds = new Set(cards.map(c => c.id));
		if (!cardIds.every(id => deckCardIds.has(id))) throw new Error("Unauthorized");

		const moving = new Set(cardIds);
		const bySubdeck = new Map(subdecks.map(s => [s.id, []]));
		for (const card of cards) {
			if (!moving.has(card.id)) bySubdeck.get(card.subdeck_id).push(card.id);
		}
		const target = bySubdeck.get(targetSubdeckId);
		const index = Math.max(0, Math.min(targetIndex ?? target.length, target.length));
		target.splice(index, 0, ...cardIds);

		const ids = [], subdeckIds = [], positions = [];
		for (const [subdeckId, list] of bySubdeck) {
			list.forEach((id, i) => { ids.push(id); subdeckIds.push(subdeckId); positions.push(i + 1); });
		}
		await client.query(`
			update cards c set subdeck_id = u.subdeck_id, position = u.position
			from unnest($1::uuid[], $2::uuid[], $3::smallint[]) u(id, subdeck_id, position)
			where c.id = u.id`, [ids, subdeckIds, positions]);
		await client.query("commit");
	} catch (err) {
		await client.query("rollback");
		throw err;
	} finally {
		client.release();
	}
}

// the user's decks by name, for the pickers that send cards to another one
const getNames = async userId => {
	const { rows } = await pool.query(
		"select id, name from decks where user_id = $1 order by position, name", [userId]);
	return rows;
}

// The subdeck cards sent to a deck land in: the one named, when it is that
// deck's and holds cards, else the last of the deck's that does. Locked, so
// two arrivals cannot take the same places. `last` is the place of its last
// card.
const landingSubdeck = async (client, userId, deckId, subdeckId) => {
	const leaves = leafSubdecks(await lockSubdecks(client, userId, deckId));
	const subdeck = leaves.find(leaf => leaf.id === subdeckId) ?? leaves[leaves.length - 1];
	const { rows: [{ last }] } = await client.query(
		"select coalesce(max(position), 0)::int last from cards where subdeck_id = $1", [subdeck.id]);
	return { id: subdeck.id, last };
}

// the cards among `cardIds` that are in this deck of the user's, in deck order
const cardsOfDeck = async (client, userId, deckId, cardIds) => {
	const { rows: cards } = await client.query(`
		select c.id, c.subdeck_id, c.position, c.front, c.back, c.card_type
		from cards c join decks d on d.id = c.deck_id
		where d.user_id = $1 and c.deck_id = $2 and c.id = any($3::uuid[])`, [userId, deckId, cardIds]);
	if (cards.length !== new Set(cardIds).size) throw new Error("Unauthorized");
	const { rows: subdecks } = await client.query(
		"select id, parent_id, position from subdecks where deck_id = $1", [deckId]);
	inDeckOrder({ subdecks, cards });
	return cards;
}

// Cards leave one deck for another, to the end of its last subdeck, in the
// order they stood in. They are the same cards — schedule and review history
// go with them — so the deck they left closes ranks behind them, and stops
// listing any of them among its sample cards.
const moveCardsToDeck = async (userId, deckId, cardIds, targetDeckId) => {
	if (deckId === targetDeckId) return;
	const client = await pool.connect();
	try {
		await client.query("begin");
		const cards = await cardsOfDeck(client, userId, deckId, cardIds);
		const subdeck = await landingSubdeck(client, userId, targetDeckId, null);
		const ids = cards.map(card => card.id);
		await client.query(`
			update cards c set deck_id = $1, subdeck_id = $2, position = $3 + u.n
			from unnest($4::uuid[]) with ordinality u(id, n)
			where c.id = u.id`, [targetDeckId, subdeck.id, subdeck.last, ids]);
		await client.query(`
			update cards c set position = r.position
			from (select id, row_number() over (partition by subdeck_id order by position) position
				from cards where deck_id = $1) r
			where c.id = r.id and c.position <> r.position`, [deckId]);
		await client.query(`
			update decks set preview_card_ids = array(
				select id from unnest(preview_card_ids) with ordinality p(id, n)
				where id <> all($2::uuid[]) order by n)
			where id = $1`, [deckId, ids]);
		await client.query("commit");
	} catch (err) {
		await client.query("rollback");
		throw err;
	} finally {
		client.release();
	}
}

// Copies of cards, as new cards: the content and the type, none of the
// progress. They go to the end of the named subdeck of the target deck, or
// of its last one, in the order the originals stand in.
const copyCards = async (userId, deckId, cardIds, targetDeckId, targetSubdeckId, FSRSValues) => {
	const client = await pool.connect();
	try {
		await client.query("begin");
		const cards = await cardsOfDeck(client, userId, deckId, cardIds);
		const subdeck = await landingSubdeck(client, userId, targetDeckId, targetSubdeckId);
		for (const [index, card] of cards.entries()) {
			await client.query(`insert into cards(
					deck_id, subdeck_id, position, front, back, card_type, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, learning_steps, state, last_review
				) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
				[targetDeckId, subdeck.id, subdeck.last + index + 1, JSON.stringify(card.front), card.back == null ? null : JSON.stringify(card.back),
					card.card_type, ...scheduleValues(card.card_type, FSRSValues)]);
		}
		await client.query("commit");
	} catch (err) {
		await client.query("rollback");
		throw err;
	} finally {
		client.release();
	}
}

// How deep the deck's progression runs (0 = none, null = every level; see
// decks.progression_depth). Touching a single deck's setting also puts the
// profile's three-way back to "per deck" — the bulk modes only mean anything
// until the next exception.
const updateProgressionDepth = async (userId, deckId, depth) => {
	const { rowCount } = await pool.query(
		"update decks set progression_depth = $3 where id = $2 and user_id = $1",
		[userId, deckId, depth]);
	if (rowCount === 1) {
		await pool.query(`update "user" set "subdeckProgressionMode" = 'per-deck' where id = $1`, [userId]);
	}

	return rowCount === 1;
}

const getSubdeckProgressionMode = async userId => {
	const { rows } = await pool.query(
		'select "subdeckProgressionMode" mode from "user" where id = $1', [userId]);

	return rows[0]?.mode;
}

// 'all'/'none' are bulk writes over every deck and instance the user studies;
// 'per-deck' just hands control back to the decks' own flags as they stand
const setSubdeckProgressionMode = async (userId, mode) => {
	await pool.query('update "user" set "subdeckProgressionMode" = $2 where id = $1', [userId, mode]);
	if (mode === "per-deck") return;
	// every level, or none
	const depth = mode === "all" ? null : 0;
	await pool.query("update decks set progression_depth = $2 where user_id = $1", [userId, depth]);
	await pool.query("update marketplace_deck_instances set progression_depth = $2 where user_id = $1", [userId, depth]);
}

const createReviewLog = async (userId, cardId, log) => {
	const { rows } = await pool.query(`
		insert into review_logs(user_id, card_id, rating, state, due, stability, difficulty, elapsed_days, last_elapsed_days, scheduled_days, learning_steps, review)
		values($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`, [userId, cardId, log.rating, log.state, log.due, log.stability, log.difficulty, log.elapsed_days, log.last_elapsed_days, log.scheduled_days, log.learning_steps, log.review])
}

export { BOUNDS, inDeckOrder, create, reorder, getMineWithCards, getMineWithoutCards, getById, updateName, remove, getListing, getImage, updateListing, updatePreviewCards, addCard, addCards, userIdOwnsDeckId, updateCardContent, updateCardType, deleteCards, updateCardStudyState, resetDeckSchedule, createReviewLog, createSubdeck, renameSubdeck, moveSubdeck, flattenSubdecks, deleteSubdeck, moveCards, getNames, moveCardsToDeck, copyCards, updateProgressionDepth, getSubdeckProgressionMode, setSubdeckProgressionMode }
