import { pool } from "./pool.js"
import { deckOutline } from "../deck-tree.js"
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

// The decks a request would publish: the deck asked for and every deck of
// the user's own inside it, as a recursive CTE named `under` over the deck
// id given as `deck` (an SQL expression).
const under = deck => `under(id) as (
	select ${deck}
	union all
	select d.id from decks d join under on d.parent_id = under.id
)`;

// What publishing a deck would take with it: how many cards are under it,
// and whether a marketplace deck taken sits anywhere inside it, which is not
// the user's to publish.
const publishable = async (client, deckId) => {
	const { rows: [found] } = await client.query(`
		with recursive ${under("$1::uuid")}
		select (select count(*) from cards c where c.deck_id in (select id from under))::int "cardCount",
			exists (select 1 from marketplace_deck_instances i where i.parent_id in (select id from under)) "holdsTaken"`,
		[deckId]);
	return found;
}

// Creates a pending upload request. A null image is the deck's own
// thumbnail. Throws if the user doesn't own the deck, nothing is under it, a
// marketplace deck taken sits inside it, or a pending/approved request
// already exists.
const createUploadRequest = async (userId, deckId, { name, description, theme, price, image, imageType, previewCardIds, authorTermsVersion }) => {
	const { rows } = await pool.query(
		"select d.image is not null has_image from decks d where d.id = $1 and d.user_id = $2",
		[deckId, userId]
	);
	if (!rows[0]) throw new Error("Unauthorized");
	const { cardCount, holdsTaken } = await publishable(pool, deckId);
	if (cardCount === 0) throw new Error("Deck has no cards");
	if (holdsTaken) throw new Error("A deck with a marketplace deck inside it cannot be published");
	if (!image && !rows[0].has_image) throw new Error("A thumbnail image is required");

	const existing = await getUploadRequestForDeck(userId, deckId);
	if (existing?.status === "pending" || existing?.status === "approved") {
		throw new Error("A request already exists for this deck");
	}

	// keep only ids that are cards under this deck, preserving the given order
	const { rows: deckCards } = await pool.query(
		`with recursive ${under("$1::uuid")} select id from cards where deck_id in (select id from under)`,
		[deckId]
	);
	const deckCardIds = new Set(deckCards.map(row => row.id));
	const preview = (previewCardIds ?? []).filter(id => deckCardIds.has(id));

	const { rows: inserted } = await pool.query(
		`insert into marketplace_upload_requests(deck_id, user_id, name, description, theme, price, image, image_type, preview_card_ids, author_terms_version)
		select d.id, d.user_id, $3, $4, $5, $6, coalesce($7, d.image), coalesce($8, d.image_type), $9, $10
		from decks d where d.id = $1 and d.user_id = $2
		returning id, name, theme, status`,
		// the description as JSON text, as pg would send its blocks array as a postgres array
		[deckId, userId, name, JSON.stringify(description), theme, price, image, imageType, preview, authorTermsVersion]
	);

	return inserted[0];
}

const getPendingUploadRequests = async () => {
	const { rows } = await pool.query(`
		select r.id, r.name, r.theme, r.price, r.created_at "createdAt", u.email,
			(with recursive ${under("r.deck_id")} select count(*) from cards c where c.deck_id in (select id from under))::int "cardCount"
		from marketplace_upload_requests r
		join "user" u on u.id = r.user_id
		where r.status = 'pending'
		order by r.created_at`
	);

	return rows;
}

// The request with what approving it would publish, for the admin to look
// through: the cards under the deck, in its reading order (articles among
// them) — the ones approveUploadRequest copies.
const getUploadRequestWithCards = async requestId => {
	const { rows: [request] } = await pool.query(`
		select r.id, r.deck_id, r.status, r.theme, r.name, r.description, r.price, r.preview_card_ids "previewCardIds", u.email
		from marketplace_upload_requests r
		join "user" u on u.id = r.user_id
		where r.id = $1`,
		[requestId]
	);
	if (!request) return undefined;

	const { rows: decks } = await pool.query(`
		with recursive ${under("$1::uuid")}
		select d.id, case when d.id = $1 then null else d.parent_id end parent_id, d.name, d.position
		from decks d where d.id in (select id from under)`, [request.deck_id]);
	const outline = deckOutline(decks);
	const order = new Map(outline.map(({ deck }, index) => [deck.id, index]));
	const { rows: cards } = await pool.query(`
		select c.id, c.deck_id, c.position, c.front, c.back, c.card_type from cards c where c.deck_id = any($1::uuid[])`,
		[decks.map(deck => deck.id)]);
	cards.sort((a, b) => order.get(a.deck_id) - order.get(b.deck_id) || a.position - b.position);

	const { deck_id, ...shown } = request;
	return {
		...shown,
		cards: cards.map(({ id, front, back, card_type }) => ({ id, front, back, card_type }))
	};
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
		select id, front, coalesce(back, '[]'::jsonb) back, card_type
		from marketplace_cards
		where marketplace_deck_id = $1 and preview_order is not null
		order by preview_order`,
		[marketplaceDeckId]
	);

	return rows;
}

// The decks inside a marketplace deck, each with the count of its own
// cards, for the contents outline on its page
const getDeckContents = async marketplaceDeckId => {
	const { rows } = await pool.query(`
		select ms.id, ms.parent_id, ms.name, ms.position,
			(select count(*) from marketplace_cards mc where mc.subdeck_id = ms.id)::int cards
		from marketplace_subdecks ms
		where ms.marketplace_deck_id = $1`,
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
			select deck_id, user_id, name, description, theme, price, image, image_type, preview_card_ids, author_terms_version
			from marketplace_upload_requests
			where id = $1 and status = 'pending'
			for update`,
			[requestId]
		);
		if (!request) throw new Error("Request not found or not pending");
		// the deck may have taken one in since it was asked for
		if ((await publishable(client, request.deck_id)).holdsTaken) {
			throw new Error("A deck with a marketplace deck inside it cannot be published");
		}

		const { rows: [mpDeck] } = await client.query(
			// reviews in order is read at the top of the list, so a deck published
			// from inside another takes it from the deck at the top; its tactic
			// ladder is the nearest one set, its own or a deck's above
			`insert into marketplace_decks(user_id, name, description, price, theme, image, image_type, in_order, reviews_in_order, tactic_ladder, deck_id, author_terms_version)
			 select $1, $2, $3, $4, $5, $6, $7, d.in_order, (
				with recursive up(id, parent_id, reviews_in_order) as (
					select d.id, d.parent_id, d.reviews_in_order
					union all
					select above.id, above.parent_id, above.reviews_in_order from decks above join up on above.id = up.parent_id
				)
				select reviews_in_order from up where parent_id is null
			 ), (
				with recursive up(parent_id, tactic_ladder, depth) as (
					select d.parent_id, d.tactic_ladder, 0
					union all
					select above.parent_id, above.tactic_ladder, up.depth + 1 from decks above join up on above.id = up.parent_id
				)
				select tactic_ladder from up where tactic_ladder is not null order by depth limit 1
			 ), d.id, $9 from decks d where d.id = $8 returning id`,
			// the description as JSON text, as pg would send its blocks array as a postgres array
			[request.user_id, request.name, JSON.stringify(request.description), request.price, request.theme, request.image, request.image_type, request.deck_id, request.author_terms_version]
		);
		// The decks inside it travel with the cards, each with its in order /
		// mixed and its tactic ladder. Every one gets its new id up front (copies),
		// so a copy can name its parent's copy (none for those directly
		// inside the published deck) and each card its deck's (none for the
		// published deck's own), all in the one statement. array_position
		// gives the preview cards their requested order and leaves
		// non-preview cards (and since-deleted preview ids) at null.
		await client.query(`
			with recursive inside(id, parent_id, name, position, in_order, tactic_ladder) as (
				select id, null::uuid, name, position, in_order, tactic_ladder from decks where parent_id = $2
				union all
				select d.id, d.parent_id, d.name, d.position, d.in_order, d.tactic_ladder from decks d join inside on d.parent_id = inside.id
			), copies as (
				select inside.*, gen_random_uuid() copy_id from inside
			), copied_decks as (
				insert into marketplace_subdecks(id, marketplace_deck_id, parent_id, name, position, in_order, tactic_ladder)
				select copy.copy_id, $1, parent.copy_id, copy.name, copy.position, copy.in_order, copy.tactic_ladder
				from copies copy
				left join copies parent on parent.id = copy.parent_id
			)
			insert into marketplace_cards(marketplace_deck_id, subdeck_id, position, front, back, preview_order, card_type)
			select $1, copy.copy_id, c.position, c.front, c.back, array_position($3::uuid[], c.id), c.card_type
			from cards c
			left join copies copy on copy.id = c.deck_id
			where c.deck_id = $2 or copy.id is not null`,
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

const FOR_SALE = "(md.on_sale and md.taken_down_reason is null)";

const OWNS = (user, deck) => `exists (select 1 from purchases p
	where p.user_id = ${user} and p.marketplace_deck_id = ${deck} and p.refunded_at is null)`;

const getOwnership = async (userId, marketplaceDeckId) => {
	const { rows: [row] } = await pool.query(`
		select ${OWNS("$1", "md.id")} or md.user_id is not distinct from $1 owned,
			exists (select 1 from marketplace_deck_instances where user_id = $1 and marketplace_deck_id = md.id)
				or (md.user_id is not distinct from $1 and md.deck_id is not null) "inLibrary"
		from marketplace_decks md where md.id = $2`,
		[userId, marketplaceDeckId]
	);
	return row ?? { owned: false, inLibrary: false };
}

// the marketplace deck published from a deck of the author's own
const getListingForDeck = async (userId, deckId) => {
	const { rows: [listing] } = await pool.query(
		'select id, name, on_sale "onSale", taken_down_reason "takenDownReason" from marketplace_decks where user_id = $1 and deck_id = $2',
		[userId, deckId]
	);
	return listing;
}

const setOnSale = async (userId, marketplaceDeckId, onSale) => {
	const { rowCount } = await pool.query(
		"update marketplace_decks set on_sale = $3 where user_id = $1 and id = $2",
		[userId, marketplaceDeckId, onSale]
	);
	return rowCount === 1;
}

// an admin's takedown, with the reason the author is sent; null restores it
const setTakenDown = async (marketplaceDeckId, reason) => {
	const { rows: [deck] } = await pool.query(`
		update marketplace_decks md set taken_down_reason = $2 where md.id = $1
		returning md.name, (select email from "user" u where u.id = md.user_id) "authorEmail"`,
		[marketplaceDeckId, reason]
	);
	return deck;
}

const getDeckForSale = async marketplaceDeckId => {
	const { rows: [deck] } = await pool.query(
		`select id, name, user_id, ${FOR_SALE} for_sale, round(price * 100)::int price_cents from marketplace_decks md where id = $1`,
		[marketplaceDeckId]
	);
	return deck;
}

const inTransaction = async work => {
	const client = await pool.connect();
	try {
		await client.query("begin");
		const result = await work(client);
		await client.query("commit");
		return result;
	} catch (err) {
		await client.query("rollback");
		throw err;
	} finally {
		client.release();
	}
}

// Creates an instance of a marketplace deck for the user, with one card
// instance per marketplace card, initialized like a brand new card. Null when
// the user has one already.
const insertDeckInstance = async (client, userId, marketplaceDeckId) => {
	// it joins the end of the top of the user's list, where their own
	// decks and the marketplace decks they have taken share the places
	const { rows: [instance] } = await client.query(
		`insert into marketplace_deck_instances(user_id, marketplace_deck_id, position)
		values($1, $2, (select coalesce(max(position), 0) + 1 from (
			select position from decks where user_id = $1 and parent_id is null
			union all
			select position from marketplace_deck_instances where user_id = $1 and parent_id is null) top))
		on conflict (user_id, marketplace_deck_id) do nothing
		returning id`,
		[userId, marketplaceDeckId]
	);
	if (!instance) return null;
	const emptyCard = createEmptyCard();
	// tactic cards and articles get null FSRS state (they're scheduled by
	// finished_at/due alone)
	await client.query(`
		insert into marketplace_card_instances(
			marketplace_deck_instance_id, marketplace_card_id, card_type,
			due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, learning_steps, state, last_review
		)
		select $1, id, card_type, $2,
			case when card_type <> 'basic' then null else $3::numeric end,
			case when card_type <> 'basic' then null else $4::numeric end,
			case when card_type <> 'basic' then null else $5::smallint end,
			case when card_type <> 'basic' then null else $6::smallint end,
			case when card_type <> 'basic' then null else $7::smallint end,
			case when card_type <> 'basic' then null else $8::smallint end,
			case when card_type <> 'basic' then null else $9::smallint end,
			case when card_type <> 'basic' then null else $10::smallint end,
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
	return instance.id;
}

const createDeckInstance = async (userId, marketplaceDeckId) => {
	if ((await getOwnership(userId, marketplaceDeckId)).inLibrary) {
		throw new Error("You already have this deck");
	}
	return inTransaction(async client => {
		await client.query(`
			insert into purchases (user_id, marketplace_deck_id, price_cents)
			values ($1, $2, 0)
			on conflict (user_id, marketplace_deck_id) where refunded_at is null do nothing`,
			[userId, marketplaceDeckId]
		);
		const instanceId = await insertDeckInstance(client, userId, marketplaceDeckId);
		if (!instanceId) throw new Error("You already have this deck");
		return instanceId;
	});
}

// A paid purchase, once Stripe has the money: the deck comes into the
// library unless it is there. "recorded" when this payment was recorded
// before; "duplicate" when the user owned the deck already.
const recordPaidPurchase = (purchase) => inTransaction(async client => {
	const { rowCount } = await client.query(`
		insert into purchases (user_id, marketplace_deck_id, price_cents, currency, tax_cents, fee_cents, author_share_cents,
			stripe_checkout_session_id, stripe_payment_intent_id, terms_version)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		on conflict do nothing`,
		[purchase.userId, purchase.marketplaceDeckId, purchase.priceCents, purchase.currency, purchase.taxCents,
			purchase.feeCents, purchase.authorShareCents, purchase.checkoutSessionId, purchase.paymentIntentId,
			purchase.termsVersion]
	);
	if (rowCount === 0) {
		const { rowCount: recorded } = await client.query(
			"select 1 from purchases where stripe_checkout_session_id = $1", [purchase.checkoutSessionId]);
		return recorded ? "recorded" : "duplicate";
	}
	await insertDeckInstance(client, purchase.userId, purchase.marketplaceDeckId);
	return "new";
});

// A marketplace deck instance's Deck tab: the listing as the marketplace
// shows it, which is the author's and read-only here
const getInstanceListing = async (userId, instanceId) => {
	const { rows } = await pool.query(`
		select i.id, md.id "marketplaceDeckId", md.name, md.description, md.theme, coalesce(u.name, md.author_name) author,
			(select count(*) from marketplace_cards mc where mc.marketplace_deck_id = md.id)::int "cardCount",
			md.user_id is not distinct from i.user_id "isAuthor",
			${REVIEW_COUNTS}
		from marketplace_deck_instances i
		join marketplace_decks md on md.id = i.marketplace_deck_id
		left join "user" u on u.id = md.user_id
		where i.user_id = $1 and i.id = $2`,
		[userId, instanceId]
	);

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

// An article of a taken deck read: finished for good; the join enforces
// ownership
const markInstanceArticleRead = async (userId, cardId) => {
	const { rowCount } = await pool.query(`
		update marketplace_card_instances ci set last_review = now(), finished_at = now(), due = now()
		from marketplace_deck_instances i
		where ci.id = $2 and ci.marketplace_deck_instance_id = i.id and i.user_id = $1 and ci.card_type = 'article'`,
		[userId, cardId]);
	return rowCount === 1;
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
		where md.id = $2 and md.user_id is distinct from $1
			and ${OWNS("$1", "md.id")}
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

export { themes, REVIEW_COUNTS, getReviews, saveReview, deleteReview, removeReview, removeReviewResponse, setReviewVote, setReviewResponse, getUploadRequestForDeck, createUploadRequest, getPendingUploadRequests, getUploadRequestWithCards, getUploadRequestImage, getDeckPreviewCards, getDeckContents, getDeckImage, approveUploadRequest, rejectUploadRequest, FOR_SALE, OWNS, getOwnership, getListingForDeck, setOnSale, setTakenDown, getDeckForSale, createDeckInstance, recordPaidPurchase, getInstanceListing, updateInstanceCardStudyState, markInstanceArticleRead, createInstanceReviewLog }
