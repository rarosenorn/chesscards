import { pool } from "./pool.js"
import { createEmptyCard } from "ts-fsrs"

const themes = ["openings", "endgames", "tactics", "strategy", "checkmates"];

// Latest upload request for a deck, or undefined
const getUploadRequestForDeck = async (userId, deckId) => {
	const { rows } = await pool.query(`
		select id, name, theme, status, rejection_reason "rejectionReason", created_at "createdAt"
		from marketplace_upload_requests
		where deck_id = $1 and user_id = $2
		order by created_at desc
		limit 1`,
		[deckId, userId]
	);

	return rows[0];
}

// Creates a pending upload request. Throws if the user doesn't own the deck,
// the deck is empty, or a pending/approved request already exists.
const createUploadRequest = async (userId, deckId, { name, description, theme, price, image, imageType, previewCardIds }) => {
	const { rows } = await pool.query(
		`select (select count(*) from cards where deck_id = d.id) card_count
		from decks d where d.id = $1 and d.user_id = $2`,
		[deckId, userId]
	);
	if (!rows[0]) throw new Error("Unauthorized");
	if (rows[0].card_count === "0") throw new Error("Deck has no cards");

	const existing = await getUploadRequestForDeck(userId, deckId);
	if (existing?.status === "pending" || existing?.status === "approved") {
		throw new Error("A request already exists for this deck");
	}

	// keep only ids that are cards of this deck, preserving the given order
	const { rows: deckCards } = await pool.query(
		"select id from cards where deck_id = $1",
		[deckId]
	);
	const deckCardIds = new Set(deckCards.map(row => row.id));
	const preview = (previewCardIds ?? []).filter(id => deckCardIds.has(id));

	const { rows: inserted } = await pool.query(
		`insert into marketplace_upload_requests(deck_id, user_id, name, description, theme, price, image, image_type, preview_card_ids)
		values($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id, name, theme, status`,
		[deckId, userId, name, description, theme, price, image, imageType, preview]
	);

	return inserted[0];
}

const getPendingUploadRequests = async () => {
	const { rows } = await pool.query(`
		select r.id, r.name, r.theme, r.price, r.created_at "createdAt", u.email, count(c.id) "cardCount"
		from marketplace_upload_requests r
		join decks d on d.id = r.deck_id
		join "user" u on u.id = r.user_id
		left join cards c on c.deck_id = d.id
		where r.status = 'pending'
		group by r.id, r.name, r.theme, r.price, r.created_at, u.email
		order by r.created_at`
	);

	return rows;
}

const getUploadRequestWithCards = async requestId => {
	const { rows } = await pool.query(`
		select r.id, r.status, r.theme, r.name, r.description, r.price, r.preview_card_ids "previewCardIds", u.email,
			json_agg(json_build_object('id', c.id, 'front', c.front, 'back', c.back)) cards
		from marketplace_upload_requests r
		join decks d on d.id = r.deck_id
		join "user" u on u.id = r.user_id
		left join cards c on c.deck_id = d.id
		where r.id = $1
		group by r.id, r.status, r.theme, r.name, r.description, r.price, r.preview_card_ids, u.email`,
		[requestId]
	);

	if (rows[0] && rows[0].cards[0]?.id === null) rows[0].cards = [];

	return rows[0];
}

// The pending request's thumbnail, for the admin review page
const getUploadRequestImage = async requestId => {
	const { rows } = await pool.query(
		'select image, image_type "imageType" from marketplace_upload_requests where id = $1',
		[requestId]
	);

	return rows[0];
}

// The cards chosen for a marketplace deck's public preview, in preview order
const getDeckPreviewCards = async marketplaceDeckId => {
	const { rows } = await pool.query(`
		select id, front, coalesce(back, '[]'::jsonb) back
		from marketplace_cards
		where marketplace_deck_id = $1 and preview_order is not null
		order by preview_order`,
		[marketplaceDeckId]
	);

	return rows;
}

// A marketplace deck's thumbnail
const getDeckImage = async marketplaceDeckId => {
	const { rows } = await pool.query(
		'select image, image_type "imageType" from marketplace_decks where id = $1',
		[marketplaceDeckId]
	);

	return rows[0];
}

// Copies the deck and its cards (as of now) into the marketplace tables and
// marks the request approved, all in one transaction.
const approveUploadRequest = async requestId => {
	const client = await pool.connect();
	try {
		await client.query("begin");
		const { rows: [request] } = await client.query(`
			select deck_id, user_id, name, description, theme, price, image, image_type, preview_card_ids
			from marketplace_upload_requests
			where id = $1 and status = 'pending'
			for update`,
			[requestId]
		);
		if (!request) throw new Error("Request not found or not pending");

		const { rows: [mpDeck] } = await client.query(
			"insert into marketplace_decks(user_id, name, description, price, theme, image, image_type) values($1, $2, $3, $4, $5, $6, $7) returning id",
			[request.user_id, request.name, request.description, request.price, request.theme, request.image, request.image_type]
		);
		// array_position gives the preview cards their requested order and
		// leaves non-preview cards (and since-deleted preview ids) at null
		await client.query(
			"insert into marketplace_cards(marketplace_deck_id, front, back, preview_order, card_type) select $1, front, back, array_position($3::uuid[], id), card_type from cards where deck_id = $2",
			[mpDeck.id, request.deck_id, request.preview_card_ids]
		);
		await client.query(
			"update marketplace_upload_requests set status = 'approved' where id = $1",
			[requestId]
		);
		await client.query("commit");
		return mpDeck.id;
	} catch (err) {
		await client.query("rollback");
		throw err;
	} finally {
		client.release();
	}
}

const rejectUploadRequest = async (requestId, reason) => {
	const { rowCount } = await pool.query(
		"update marketplace_upload_requests set status = 'rejected', rejection_reason = $2 where id = $1 and status = 'pending'",
		[requestId, reason]
	);

	return rowCount === 1;
}

const userHasDeckInstance = async (userId, marketplaceDeckId) => {
	const { rowCount } = await pool.query(
		"select id from marketplace_deck_instances where user_id = $1 and marketplace_deck_id = $2",
		[userId, marketplaceDeckId]
	);

	return rowCount > 0;
}

// Creates an instance of a marketplace deck for the user, with one card
// instance per marketplace card, initialized like a brand new card.
const createDeckInstance = async (userId, marketplaceDeckId) => {
	if (await userHasDeckInstance(userId, marketplaceDeckId)) {
		throw new Error("You already have this deck");
	}

	const client = await pool.connect();
	try {
		await client.query("begin");
		const { rows: [instance] } = await client.query(
			"insert into marketplace_deck_instances(user_id, marketplace_deck_id) values($1, $2) returning id",
			[userId, marketplaceDeckId]
		);
		const emptyCard = createEmptyCard();
		// tactic cards get null FSRS state (they're scheduled by finished_at/due alone)
		await client.query(`
			insert into marketplace_card_instances(
				marketplace_deck_instance_id, marketplace_card_id, card_type,
				due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, learning_steps, state, last_review
			)
			select $1, id, card_type, $2,
				case when card_type = 'tactic' then null else $3::numeric end,
				case when card_type = 'tactic' then null else $4::numeric end,
				case when card_type = 'tactic' then null else $5::smallint end,
				case when card_type = 'tactic' then null else $6::smallint end,
				case when card_type = 'tactic' then null else $7::smallint end,
				case when card_type = 'tactic' then null else $8::smallint end,
				case when card_type = 'tactic' then null else $9::smallint end,
				case when card_type = 'tactic' then null else $10::smallint end,
				$11::timestamptz
			from marketplace_cards where marketplace_deck_id = $12`,
			[
				instance.id,
				emptyCard.due, emptyCard.stability, emptyCard.difficulty, emptyCard.elapsed_days,
				emptyCard.scheduled_days, emptyCard.reps, emptyCard.lapses, emptyCard.learning_steps,
				emptyCard.state, emptyCard.last_review,
				marketplaceDeckId
			]
		);
		await client.query("commit");
		return instance.id;
	} catch (err) {
		await client.query("rollback");
		throw err;
	} finally {
		client.release();
	}
}

// The user's marketplace deck instances for the My flashcards listing,
// same shape as decks.getMineWithoutCards
const getInstancesWithoutCards = async userId => {
	const { rows } = await pool.query(`
		select i.id, md.name, count(ci.id) no_cards, count(ci.id) filter (where ci.due <= now() and ci.finished_at is null) due_cards
		from marketplace_deck_instances i
		join marketplace_decks md on md.id = i.marketplace_deck_id
		left join marketplace_card_instances ci on ci.marketplace_deck_instance_id = i.id
		where i.user_id = $1
		group by i.id, md.name`,
		[userId]
	);

	return rows;
}

// An instance with its cards shaped like decks.getById's cards (content from
// marketplace_cards, FSRS state from the instance rows) so study/browse can
// render them unchanged
const getInstanceById = async (userId, instanceId) => {
	const { rows } = await pool.query(`
		select i.id, md.name, json_agg(json_build_object(
			'id', ci.id,
			'marketplace_deck_instance_id', ci.marketplace_deck_instance_id,
			'front', mc.front, 'back', mc.back,
			'due', ci.due, 'stability', ci.stability, 'difficulty', ci.difficulty,
			'elapsed_days', ci.elapsed_days, 'scheduled_days', ci.scheduled_days,
			'reps', ci.reps, 'lapses', ci.lapses, 'learning_steps', ci.learning_steps,
			'state', ci.state, 'last_review', ci.last_review,
			'card_type', ci.card_type, 'finished_at', ci.finished_at
		)) cards
		from marketplace_deck_instances i
		join marketplace_decks md on md.id = i.marketplace_deck_id
		left join marketplace_card_instances ci on ci.marketplace_deck_instance_id = i.id
		left join marketplace_cards mc on mc.id = ci.marketplace_card_id
		where i.user_id = $1 and i.id = $2
		group by i.id, md.name`,
		[userId, instanceId]
	);

	if (rows[0] && rows[0].cards[0]?.id === null) rows[0].cards = [];

	return rows[0];
}

// Updates FSRS state on a card instance; the join enforces ownership
const updateInstanceCardStudyState = async (userId, card) => {
	const { rowCount } = await pool.query(`
		update marketplace_card_instances ci
		set due = $1, stability = $2, difficulty = $3, elapsed_days = $4, scheduled_days = $5, reps = $6, lapses = $7, learning_steps = $8, state = $9, last_review = $10, finished_at = $11
		from marketplace_deck_instances i
		where ci.id = $12 and ci.marketplace_deck_instance_id = i.id and i.user_id = $13`,
		[card.due, card.stability, card.difficulty, card.elapsed_days, card.scheduled_days, card.reps, card.lapses, card.learning_steps, card.state, card.last_review, card.finished_at ?? null, card.id, userId]
	);

	return rowCount === 1;
}

// the instance's own copy of decks.resetDeckSchedule: the cards belong to the
// marketplace deck, but the progress over them is the user's to restart
const resetInstanceSchedule = async (userId, instanceId, FSRSValues) => {
	const basic = await pool.query(`
		update marketplace_card_instances ci set
			finished_at = null,
			due = $3, stability = $4, difficulty = $5, elapsed_days = $6, scheduled_days = $7,
			reps = $8, lapses = $9, learning_steps = $10, state = $11, last_review = $12
		from marketplace_deck_instances i
		where ci.marketplace_deck_instance_id = i.id and i.id = $2 and i.user_id = $1
			and ci.card_type = 'basic'`,
		[userId, instanceId, ...FSRSValues]
	);
	const tactic = await pool.query(`
		update marketplace_card_instances ci set
			finished_at = null, due = now(),
			stability = null, difficulty = null, elapsed_days = null, scheduled_days = null,
			reps = null, lapses = null, learning_steps = null, state = null, last_review = null
		from marketplace_deck_instances i
		where ci.marketplace_deck_instance_id = i.id and i.id = $2 and i.user_id = $1
			and ci.card_type = 'tactic'`,
		[userId, instanceId]
	);

	return basic.rowCount + tactic.rowCount;
}

const createInstanceReviewLog = async (userId, instanceCardId, log) => {
	await pool.query(`
		insert into review_logs(user_id, marketplace_card_instance_id, rating, state, due, stability, difficulty, elapsed_days, last_elapsed_days, scheduled_days, learning_steps, review)
		values($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
		[userId, instanceCardId, log.rating, log.state, log.due, log.stability, log.difficulty, log.elapsed_days, log.last_elapsed_days, log.scheduled_days, log.learning_steps, log.review]
	)
}

export { themes, getUploadRequestForDeck, createUploadRequest, getPendingUploadRequests, getUploadRequestWithCards, getUploadRequestImage, getDeckPreviewCards, getDeckImage, approveUploadRequest, rejectUploadRequest, userHasDeckInstance, createDeckInstance, getInstancesWithoutCards, getInstanceById, updateInstanceCardStudyState, resetInstanceSchedule, createInstanceReviewLog }
