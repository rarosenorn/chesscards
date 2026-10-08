import { pool } from "./pool.js"
import { BOUNDS, listCounts, withListing, inDeckOrder } from "./decks.js"
import { createEmptyCard } from "ts-fsrs"

const themes = ["openings", "endgames", "tactics", "strategy", "checkmates"];

// how many reviews a deck has and how many of them recommend it: two columns
// for any query that has marketplace_decks as md (ReviewCounts shows them)
const REVIEW_COUNTS = `
	(select count(*) from marketplace_reviews r where r.marketplace_deck_id = md.id)::int "reviewCount",
	(select count(*) from marketplace_reviews r where r.marketplace_deck_id = md.id and r.recommended)::int "recommendCount"`;

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

// Creates a pending upload request. A null image is the deck's own
// thumbnail. Throws if the user doesn't own the deck, the deck is empty, or a
// pending/approved request already exists.
const createUploadRequest = async (userId, deckId, { name, description, theme, price, image, imageType, previewCardIds }) => {
	const { rows } = await pool.query(
		`select (select count(*) from cards where deck_id = d.id) card_count, d.image is not null has_image
		from decks d where d.id = $1 and d.user_id = $2`,
		[deckId, userId]
	);
	if (!rows[0]) throw new Error("Unauthorized");
	if (rows[0].card_count === "0") throw new Error("Deck has no cards");
	if (!image && !rows[0].has_image) throw new Error("A thumbnail image is required");

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
		select d.id, d.user_id, $3, $4, $5, $6, coalesce($7, d.image), coalesce($8, d.image_type), $9
		from decks d where d.id = $1 and d.user_id = $2
		returning id, name, theme, status`,
		// the description as JSON text, as pg would send its blocks array as a postgres array
		[deckId, userId, name, JSON.stringify(description), theme, price, image, imageType, preview]
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
			`insert into marketplace_decks(user_id, name, description, price, theme, image, image_type, uses_subdecks, progression_depth)
			 select $1, $2, $3, $4, $5, $6, $7, d.uses_subdecks, d.progression_depth from decks d where d.id = $8 returning id`,
			[request.user_id, request.name, request.description, request.price, request.theme, request.image, request.image_type, request.deck_id]
		);
		// The subdeck tree travels with the cards. Every subdeck gets its new id
		// up front (copies), so a copy can name its parent's copy and each
		// card its subdeck's, all in the one statement. array_position gives
		// the preview cards their requested order and leaves non-preview
		// cards (and since-deleted preview ids) at null.
		await client.query(`
			with copies as (
				select s.id source_id, gen_random_uuid() id, s.parent_id, s.name, s.position
				from subdecks s where s.deck_id = $2
			), copied_subdecks as (
				insert into marketplace_subdecks(id, marketplace_deck_id, parent_id, name, position)
				select copy.id, $1, parent.id, copy.name, copy.position
				from copies copy
				left join copies parent on parent.source_id = copy.parent_id
			)
			insert into marketplace_cards(marketplace_deck_id, subdeck_id, position, front, back, preview_order, card_type)
			select $1, copy.id, c.position, c.front, c.back, array_position($3::uuid[], c.id), c.card_type
			from cards c
			join copies copy on copy.source_id = c.subdeck_id
			where c.deck_id = $2`,
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
			`insert into marketplace_deck_instances(user_id, marketplace_deck_id, position, progression_depth)
			values($1, $2,
				(select coalesce(max(position), 0) + 1 from marketplace_deck_instances where user_id = $1),
				(select progression_depth from marketplace_decks where id = $2))
			returning id`,
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
// due and still in play — the day-boundary rule, as in decks.getMineWithoutCards
const DUE = `ci.finished_at is null and (
	ci.due <= now()
	or (ci.last_review is not null
		and ci.due - ci.last_review >= interval '1 day'
		and ci.due < bounds.day_end)
)`;

const getInstancesWithoutCards = async (userId, { timeZone, rolloverHour }) => {
	const { rows: decks } = await pool.query(`
		select i.id, md.name, md.uses_subdecks "usesSubdecks", i.progression_depth "progressionDepth"
		from marketplace_deck_instances i
		join marketplace_decks md on md.id = i.marketplace_deck_id
		where i.user_id = $1 order by i.position`, [userId]);
	// the subdecks are the marketplace deck's, said once for each copy of it
	const { rows: subdecks } = await pool.query(`
		select ms.id, i.id deck_id, ms.parent_id, ms.name, ms.position
		from marketplace_subdecks ms
		join marketplace_deck_instances i on i.marketplace_deck_id = ms.marketplace_deck_id
		where i.user_id = $1`, [userId]);
	const { rows: counted } = await pool.query(`
		with bounds as (${BOUNDS})
		select i.id deck_id, mc.subdeck_id, ${listCounts("ci", DUE)}
		from marketplace_card_instances ci
		join marketplace_cards mc on mc.id = ci.marketplace_card_id
		join marketplace_deck_instances i on i.id = ci.marketplace_deck_instance_id
		cross join bounds
		where i.user_id = $1
		group by i.id, mc.subdeck_id`, [userId, timeZone, rolloverHour]);

	return withListing(decks, subdecks, counted);
}

// the user's marketplace decks in the order given (see decks.reorder)
const reorderInstances = async (userId, ids) => {
	const { rowCount } = await pool.query(`
		update marketplace_deck_instances i set position = u.n
		from unnest($2::uuid[]) with ordinality u(id, n)
		where i.id = u.id and i.user_id = $1
			and (select count(*) from marketplace_deck_instances where user_id = $1) = cardinality($2::uuid[])`,
		[userId, ids]);

	return rowCount === ids.length;
}

// An instance with its cards shaped like decks.getById's cards (content from
// marketplace_cards, FSRS state from the instance rows) so study/browse can
// render them unchanged
const getInstanceById = async (userId, instanceId) => {
	const { rows } = await pool.query(`
		select i.id, md.name, md.uses_subdecks "usesSubdecks", i.progression_depth "progressionDepth",
			coalesce((select json_agg(json_build_object('id', ms.id, 'parent_id', ms.parent_id, 'name', ms.name, 'position', ms.position) order by ms.position)
				from marketplace_subdecks ms where ms.marketplace_deck_id = md.id), '[]'::json) subdecks,
			coalesce(json_agg(json_build_object(
				'id', ci.id,
				'marketplace_deck_instance_id', ci.marketplace_deck_instance_id,
				'subdeck_id', mc.subdeck_id, 'position', mc.position,
				'front', mc.front, 'back', mc.back,
				'due', ci.due, 'stability', ci.stability, 'difficulty', ci.difficulty,
				'elapsed_days', ci.elapsed_days, 'scheduled_days', ci.scheduled_days,
				'reps', ci.reps, 'lapses', ci.lapses, 'learning_steps', ci.learning_steps,
				'state', ci.state, 'last_review', ci.last_review,
				'card_type', ci.card_type, 'finished_at', ci.finished_at
			)) filter (where ci.id is not null), '[]'::json) cards
		from marketplace_deck_instances i
		join marketplace_decks md on md.id = i.marketplace_deck_id
		left join marketplace_card_instances ci on ci.marketplace_deck_instance_id = i.id
		left join marketplace_cards mc on mc.id = ci.marketplace_card_id
		where i.user_id = $1 and i.id = $2
		group by i.id, md.id, md.name, md.uses_subdecks`,
		[userId, instanceId]
	);
	if (rows[0]) inDeckOrder(rows[0]);

	return rows[0];
}

// A marketplace deck instance's Deck tab: the listing as the marketplace
// shows it, which is the author's and read-only here
const getInstanceListing = async (userId, instanceId) => {
	const { rows } = await pool.query(`
		select i.id, md.id "marketplaceDeckId", md.name, md.description, md.theme, u.name author,
			(select count(*) from marketplace_cards mc where mc.marketplace_deck_id = md.id)::int "cardCount",
			md.user_id = i.user_id "isAuthor",
			${REVIEW_COUNTS}
		from marketplace_deck_instances i
		join marketplace_decks md on md.id = i.marketplace_deck_id
		join "user" u on u.id = md.user_id
		where i.user_id = $1 and i.id = $2`,
		[userId, instanceId]
	);

	return rows[0];
}

// the studier's own progression depth; setting it is the same kind of
// per-deck exception a personal deck's is
const updateInstanceProgressionDepth = async (userId, instanceId, depth) => {
	const { rowCount } = await pool.query(
		"update marketplace_deck_instances set progression_depth = $3 where id = $2 and user_id = $1",
		[userId, instanceId, depth]);
	if (rowCount === 1) {
		await pool.query(`update "user" set "subdeckProgressionMode" = 'per-deck' where id = $1`, [userId]);
	}

	return rowCount === 1;
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

// How long after posting a review can still be rewritten. Past it the text
// is fixed, so the votes and the author's response stay true to what they
// were given to; changing your mind then is deleting and writing a new one.
const EDIT_WINDOW = "interval '5 minutes'";

// A deck's reviews, most helpful first: by helpful votes less unhelpful ones,
// both of which are shown. userId (null when logged out) marks the viewer's
// own review, with how long it can still be edited (editableMs, 0 once it is
// locked), and their vote on the others. cardsStudied is how
// many of the deck's cards the reviewer has graded at least once: what Steam's
// hours played is to a game.
const getReviews = async (marketplaceDeckId, userId) => {
	const { rows } = await pool.query(`
		select r.id, r.recommended, r.body, u.name author,
			r.created_at "createdAt",
			r.author_response "authorResponse", r.author_response_at "authorResponseAt",
			coalesce(r.user_id = $2::uuid, false) mine,
			case when r.user_id = $2::uuid
				then greatest(0, extract(epoch from r.created_at + ${EDIT_WINDOW} - now()) * 1000)::int
				else 0 end "editableMs",
			(select count(*) from marketplace_review_votes v where v.review_id = r.id and v.value = 1)::int helpful,
			(select count(*) from marketplace_review_votes v where v.review_id = r.id and v.value = -1)::int unhelpful,
			coalesce((select v.value from marketplace_review_votes v where v.review_id = r.id and v.user_id = $2::uuid), 0)::int "myVote",
			(select count(distinct rl.marketplace_card_instance_id)
				from review_logs rl
				join marketplace_card_instances ci on ci.id = rl.marketplace_card_instance_id
				join marketplace_deck_instances i on i.id = ci.marketplace_deck_instance_id
				where i.user_id = r.user_id and i.marketplace_deck_id = r.marketplace_deck_id)::int "cardsStudied"
		from marketplace_reviews r
		join "user" u on u.id = r.user_id
		where r.marketplace_deck_id = $1
		order by coalesce((select sum(v.value) from marketplace_review_votes v where v.review_id = r.id), 0) desc,
			r.created_at desc`,
		[marketplaceDeckId, userId ?? null]
	);

	return rows;
}

// Posts the user's review of a deck, or rewrites the one they posted within
// the edit window. "saved"; "locked" when their review is past the window;
// "refused" when they do not have the deck or wrote it themselves.
const saveReview = async (userId, marketplaceDeckId, { recommended, body }) => {
	const { rowCount } = await pool.query(`
		insert into marketplace_reviews(marketplace_deck_id, user_id, recommended, body)
		select md.id, $1, $3, $4
		from marketplace_decks md
		where md.id = $2 and md.user_id <> $1
			and exists (select 1 from marketplace_deck_instances i where i.user_id = $1 and i.marketplace_deck_id = md.id)
		on conflict (marketplace_deck_id, user_id)
		do update set recommended = excluded.recommended, body = excluded.body
		where marketplace_reviews.created_at > now() - ${EDIT_WINDOW}`,
		[userId, marketplaceDeckId, recommended, body]
	);
	if (rowCount === 1) return "saved";

	const existing = await pool.query(
		"select 1 from marketplace_reviews where user_id = $1 and marketplace_deck_id = $2",
		[userId, marketplaceDeckId]
	);
	return existing.rowCount === 1 ? "locked" : "refused";
}

// Takes the user's review of a deck down, and with it its votes and the
// author's response
const deleteReview = async (userId, marketplaceDeckId) => {
	const { rowCount } = await pool.query(
		"delete from marketplace_reviews where user_id = $1 and marketplace_deck_id = $2",
		[userId, marketplaceDeckId]
	);

	return rowCount === 1;
}

// Moderation: an admin takes anyone's review down, votes and response with
// it, or only the author's response to it. The callers check for the admin.
const removeReview = async (marketplaceDeckId, reviewId) => {
	const { rowCount } = await pool.query(
		"delete from marketplace_reviews where id = $2 and marketplace_deck_id = $1",
		[marketplaceDeckId, reviewId]
	);

	return rowCount === 1;
}

const removeReviewResponse = async (marketplaceDeckId, reviewId) => {
	const { rowCount } = await pool.query(
		"update marketplace_reviews set author_response = null, author_response_at = null where id = $2 and marketplace_deck_id = $1",
		[marketplaceDeckId, reviewId]
	);

	return rowCount === 1;
}

// The user's helpful (1) / not helpful (-1) vote on someone else's review of
// the deck; 0 takes it back. Not the deck's author's to cast: one vote would
// be enough to push a critical review down.
const setReviewVote = async (userId, marketplaceDeckId, reviewId, value) => {
	if (value === 0) {
		await pool.query(
			"delete from marketplace_review_votes where review_id = $1 and user_id = $2",
			[reviewId, userId]
		);
		return true;
	}
	const { rowCount } = await pool.query(`
		insert into marketplace_review_votes(review_id, user_id, value)
		select r.id, $1, $4
		from marketplace_reviews r
		where r.id = $3 and r.marketplace_deck_id = $2 and r.user_id <> $1
			and not exists (select 1 from marketplace_decks md where md.id = r.marketplace_deck_id and md.user_id = $1)
		on conflict (review_id, user_id) do update set value = excluded.value`,
		[userId, marketplaceDeckId, reviewId, value]
	);

	return rowCount === 1;
}

// The deck author's reply to a review of their deck; null removes it
const setReviewResponse = async (userId, marketplaceDeckId, reviewId, response) => {
	const { rowCount } = await pool.query(`
		update marketplace_reviews r
		set author_response = $4, author_response_at = case when $4::text is null then null else now() end
		from marketplace_decks md
		where r.id = $3 and r.marketplace_deck_id = $2 and md.id = r.marketplace_deck_id and md.user_id = $1`,
		[userId, marketplaceDeckId, reviewId, response]
	);

	return rowCount === 1;
}

export { themes, REVIEW_COUNTS, getReviews, saveReview, deleteReview, removeReview, removeReviewResponse, setReviewVote, setReviewResponse, getUploadRequestForDeck, createUploadRequest, getPendingUploadRequests, getUploadRequestWithCards, getUploadRequestImage, getDeckPreviewCards, getDeckImage, approveUploadRequest, rejectUploadRequest, userHasDeckInstance, createDeckInstance, getInstancesWithoutCards, reorderInstances, getInstanceById, getInstanceListing, updateInstanceCardStudyState, updateInstanceProgressionDepth, resetInstanceSchedule, createInstanceReviewLog }
