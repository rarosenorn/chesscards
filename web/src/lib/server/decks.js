import { pool } from "./pool.js"
import { childrenByParent, deckSubtree, readingOrder, byReadingOrder, deckListing, deckOutline, tacticLadder } from "../deck-tree.js"
import { LEARN_AHEAD_MS } from "../rollover.js"

// A user's decks nest, as Anki's do (see lib/deck-tree.js for the tree and
// sql/init.sql for the tables). Their library is one tree of three kinds of
// deck, all shaped alike ({ id, parent_id, name, position, in_order,
// reviews_in_order, tactic_ladder, bought, instance_id }):
// - their own (decks),
// - the marketplace decks they have taken (marketplace_deck_instances: the
//   instance's id is the deck's, and it may sit inside a deck of their own),
// - and the decks inside those (marketplace_subdecks, each said once for the
//   copy of it this user has).
// A bought deck and the decks inside it carry its instance_id. Their in
// order / mixed is the author's unless the studier has chosen otherwise, and
// so is the bought deck's reviews in order. Their tactic ladder is the
// author's.

// Due and still in play — the shared condition behind every count below, and
// the SQL twin of isDueAt (lib/rollover.js). An interval of a day or more is
// read against the day boundary rather than the clock time it was graded at,
// so a card graded at 10pm is waiting at 4am; the short learning steps keep
// their exact times. bounds.day_end is the end of the rollover day we are in.
const due = c => `${c}.finished_at is null and (
	${c}.due <= now()
	or (${c}.last_review is not null
		and ${c}.due - ${c}.last_review >= interval '1 day'
		and ${c}.due < bounds.day_end)
)`;

// The end of the current rollover day, from the user's hour ($3) and the zone
// the browser left in a cookie ($2) — the server renders these counts and has
// no one to ask. Subtracting the hour before truncating is what puts the small
// hours in the previous day: at 1am the day started at 4am YESTERDAY.
const BOUNDS = `select ((
	date_trunc('day', (now() at time zone $2) - make_interval(hours => $3))
		+ make_interval(hours => $3) + interval '1 day'
) at time zone $2) day_end`;

// Within reach of learn-ahead — the SQL twin of isDueSoonAt (lib/rollover.js),
// for the learning count: a short step counts as waiting from that long
// before it falls due, as it does in study.
const dueSoon = c => `(${c}.finished_at is null
	and (${c}.last_review is null or ${c}.due - ${c}.last_review < interval '1 day')
	and ${c}.due <= now() + make_interval(secs => ${LEARN_AHEAD_MS / 1000}))`;

// What is seen of a card (alias c) — the SQL twin of isSeen (lib/deck-tree.js).
// A tactic card or an article carries no FSRS state, so its last_review
// stands in (an article read is finished as well).
const seen = c => `case when ${c}.card_type = 'basic'
	then ${c}.state <> 0
	else ${c}.finished_at is not null or ${c}.last_review is not null end`;

// The list's raw numbers for a group of cards (alias c): what progression
// goes by — the SQL twins of isSeen and isGraduated — and what is due, in
// anki's three columns. A tactic card never answered is new, otherwise it is
// a card coming round again (no learning step). An article is read, not
// studied: it is in no column (Study's counts leave it out the same way).
const listCounts = c => `
	count(*)::int total,
	count(*) filter (where ${seen(c)})::int seen,
	count(*) filter (where case when ${c}.card_type = 'basic'
		then ${c}.state in (2, 3)
		else ${c}.finished_at is not null or coalesce(${c}.reps, 0) > 0 end)::int graduated,
	count(*) filter (where ${due(c)} and ${c}.card_type <> 'article' and (${c}.state = 0 or (${c}.state is null and ${c}.last_review is null)))::int "new",
	count(*) filter (where (${due(c)} or ${dueSoon(c)}) and ${c}.state in (1, 3))::int learn,
	count(*) filter (where ${due(c)} and ${c}.card_type <> 'article' and (${c}.state = 2 or (${c}.state is null and ${c}.last_review is not null)))::int review`;

// the deck a bought card sits in: the one inside the marketplace deck, or
// the marketplace deck itself (its instance)
const BOUGHT_DECK = "coalesce(mc.subdeck_id, i.id)";

// --- the library ---

// Every deck of the user's, of the three kinds, without cards.
const getLibrary = async (userId, client = pool) => {
	const { rows } = await client.query(`
		select d.id, d.parent_id, d.name, d.position, d.in_order, d.reviews_in_order, d.tactic_ladder, false bought, null::uuid instance_id
		from decks d where d.user_id = $1
		union all
		select i.id, i.parent_id, md.name, i.position,
			coalesce((i.in_order_overrides ->> i.id::text)::boolean, md.in_order),
			coalesce(i.reviews_in_order, md.reviews_in_order), md.tactic_ladder, true, i.id
		from marketplace_deck_instances i
		join marketplace_decks md on md.id = i.marketplace_deck_id
		where i.user_id = $1
		union all
		select ms.id, coalesce(ms.parent_id, i.id), ms.name, ms.position,
			coalesce((i.in_order_overrides ->> ms.id::text)::boolean, ms.in_order), false, ms.tactic_ladder, true, i.id
		from marketplace_subdecks ms
		join marketplace_deck_instances i on i.marketplace_deck_id = ms.marketplace_deck_id
		where i.user_id = $1`, [userId]);
	return rows;
}

// each deck's own numbers (listCounts), for the cards sitting in it
const countsByDeck = async (userId, { timeZone, rolloverHour }) => {
	const { rows } = await pool.query(`
		with bounds as (${BOUNDS})
		select c.deck_id, ${listCounts("c")}
		from cards c join decks d on d.id = c.deck_id cross join bounds
		where d.user_id = $1
		group by c.deck_id
		union all
		select ${BOUGHT_DECK} deck_id, ${listCounts("ci")}
		from marketplace_card_instances ci
		join marketplace_cards mc on mc.id = ci.marketplace_card_id
		join marketplace_deck_instances i on i.id = ci.marketplace_deck_instance_id
		cross join bounds
		where i.user_id = $1
		group by 1`, [userId, timeZone, rolloverHour]);
	return new Map(rows.map(row => [row.deck_id, row]));
}

// The My flashcards list: every deck in reading order, each with the counts
// of everything under it and whether progression has it locked (deckListing).
const getListing = async (userId, when) => {
	const library = await getLibrary(userId);
	return deckListing(library, await countsByDeck(userId, when)).map(({ deck, ...row }) => ({
		id: deck.id, parent_id: deck.parent_id, name: deck.name, in_order: deck.in_order,
		bought: deck.bought, instance_id: deck.instance_id, ...row
	}));
}

// A bought card as study and the Cards tab take it, shaped as a card of the
// user's own: content from marketplace_cards, progress from the instance,
// deck_id the deck it sits in.
const BOUGHT_CARD = `json_build_object(
	'id', ci.id,
	'marketplace_deck_instance_id', ci.marketplace_deck_instance_id,
	'deck_id', ${BOUGHT_DECK}, 'position', mc.position,
	'front', mc.front, 'back', mc.back,
	'due', ci.due, 'stability', ci.stability, 'difficulty', ci.difficulty,
	'elapsed_days', ci.elapsed_days, 'scheduled_days', ci.scheduled_days,
	'reps', ci.reps, 'lapses', ci.lapses, 'learning_steps', ci.learning_steps,
	'state', ci.state, 'last_review', ci.last_review,
	'card_type', ci.card_type, 'finished_at', ci.finished_at)`;

// A deck of the library as its pages take it: the deck, everything inside it
// (decks: it first, then the rest in reading order), the cards of all of them
// in reading order, the decks it sits inside (ancestors, outermost first),
// and the whole tree from the deck at the top (tree, in reading order, each
// with its level). Undefined when the id is none of the user's.
const getDeck = async (userId, id) => {
	const library = await getLibrary(userId);
	const deck = library.find(entry => entry.id === id);
	if (!deck) return undefined;

	const inside = deckSubtree(library, id);
	const decks = deckOutline(library.filter(entry => inside.has(entry.id)).map(entry =>
		entry.id === id ? { ...entry, parent_id: null } : entry)).map(({ deck: entry }) => entry);
	const byId = new Map(library.map(entry => [entry.id, entry]));
	const ancestors = [];
	for (let at = byId.get(deck.parent_id); at; at = byId.get(at.parent_id)) ancestors.unshift(at);
	const top = ancestors[0] ?? deck;
	const family = deckSubtree(library, top.id);
	const tree = deckOutline(library.filter(entry => family.has(entry.id)).map(entry =>
		entry.id === top.id ? { ...entry, parent_id: null } : entry))
		.map(({ deck: entry, level }) => ({ id: entry.id, name: entry.name, bought: entry.bought, level }));

	const own = decks.filter(entry => !entry.bought).map(entry => entry.id);
	const instances = [...new Set(decks.filter(entry => entry.bought).map(entry => entry.instance_id))];
	const { rows: [{ cards }] } = await pool.query(`
		select coalesce((select json_agg(to_jsonb(c)) from cards c where c.deck_id = any($1::uuid[])), '[]'::json)::jsonb
			|| coalesce((select json_agg(${BOUGHT_CARD})
				from marketplace_card_instances ci
				join marketplace_cards mc on mc.id = ci.marketplace_card_id
				join marketplace_deck_instances i on i.id = ci.marketplace_deck_instance_id
				where i.user_id = $3 and i.id = any($2::uuid[]) and ${BOUGHT_DECK} = any($4::uuid[])), '[]'::json)::jsonb cards`,
		[own, instances, userId, [...inside]]);
	cards.sort(byReadingOrder(readingOrder(decks)));

	return {
		id: deck.id,
		name: deck.name,
		inOrder: deck.in_order,
		// the deck at the top's say, for everything inside it
		reviewsInOrder: (ancestors[0] ?? deck).reviews_in_order,
		// the deck's own tactic ladder (null: it takes parentLadder)
		tacticLadder: deck.tactic_ladder,
		parentLadder: tacticLadder(byId, deck.parent_id),
		isMarketplace: deck.bought,
		instanceId: deck.instance_id,
		ancestors: ancestors.map(entry => ({ id: entry.id, name: entry.name, bought: entry.bought })),
		tree,
		// each with the tactic ladder its cards climb, found through the decks
		// around it too
		decks: decks.map(entry => ({ ...entry, ladder: tacticLadder(byId, entry.id) })),
		cards
	};
}

// The user's own decks and the marketplace decks taken that sit among them,
// locked for the write that follows: what the moves below rearrange.
const lockLibrary = async (client, userId) => {
	const { rows: own } = await client.query(
		"select id, parent_id, position, false bought from decks where user_id = $1 for update", [userId]);
	const { rows: taken } = await client.query(
		"select id, parent_id, position, true bought from marketplace_deck_instances where user_id = $1 for update", [userId]);
	return [...own, ...taken];
}

// Siblings numbered 1..n in the order given, whichever of the two tables each
// sits in: decks of the user's own and marketplace decks taken share their
// places.
const numberSiblings = async (client, siblings) => {
	const ids = siblings.map(sibling => sibling.id);
	await client.query(`
		update decks d set position = u.n from unnest($1::uuid[]) with ordinality u(id, n)
		where d.id = u.id and d.position <> u.n`, [ids]);
	await client.query(`
		update marketplace_deck_instances i set position = u.n from unnest($1::uuid[]) with ordinality u(id, n)
		where i.id = u.id and i.position <> u.n`, [ids]);
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

// A new deck at the end of the top of the list, or inside a deck of the
// user's own. A name already among its siblings is refused (23505).
const create = (userId, name, parentId = null) => inTransaction(async client => {
	const library = await lockLibrary(client, userId);
	if (parentId && !library.some(entry => entry.id === parentId && !entry.bought)) throw new Error("Unauthorized");
	const siblings = childrenByParent(library).get(parentId) ?? [];
	const { rows: [deck] } = await client.query(`
		insert into decks(user_id, name, parent_id, position) values ($1, $2, $3, $4)
		returning id, name`, [userId, name, parentId, siblings.length + 1]);
	return deck;
});

const rename = async (userId, id, name) => {
	const { rowCount } = await pool.query("update decks set name = $3 where id = $2 and user_id = $1", [userId, id, name]);
	return rowCount === 1;
}

// A deck of the user's own, or a marketplace deck they have taken, moves
// with everything inside it to sit at index (0-based; null appends) among
// the decks inside parentId — the top of the list when that is null. Only
// into a deck of their own, and never into itself or anything inside it.
// A name already there is refused (23505).
const move = (userId, id, parentId, index) => inTransaction(async client => {
	const library = await lockLibrary(client, userId);
	const moving = library.find(entry => entry.id === id);
	if (!moving) throw new Error("Unauthorized");
	if (parentId && !library.some(entry => entry.id === parentId && !entry.bought)) throw new Error("Unauthorized");
	if (parentId && deckSubtree(library, id).has(parentId)) throw new Error("A deck cannot go inside itself");

	const children = childrenByParent(library);
	const from = moving.parent_id ?? null;
	const left = (children.get(from) ?? []).filter(entry => entry.id !== id);
	const joined = from === parentId ? left : [...(children.get(parentId) ?? [])];
	joined.splice(Math.max(0, Math.min(index ?? joined.length, joined.length)), 0, moving);

	await client.query(`update ${moving.bought ? "marketplace_deck_instances" : "decks"} set parent_id = $2 where id = $1`, [id, parentId]);
	await numberSiblings(client, joined);
	if (from !== parentId) await numberSiblings(client, left);
});

// A deck goes with every deck and card inside it (the caller has asked the
// user first when there are cards). What was answered on them stays in
// review_logs, as study done. A marketplace deck taken that sat inside it was
// not the user's to delete: it comes to the end of the top of the list.
const remove = (userId, id) => inTransaction(async client => {
	const library = await lockLibrary(client, userId);
	const deck = library.find(entry => entry.id === id && !entry.bought);
	if (!deck) return false;
	const inside = deckSubtree(library, id);
	const rescued = library.filter(entry => entry.bought && inside.has(entry.parent_id));
	const children = childrenByParent(library);
	const left = (children.get(deck.parent_id ?? null) ?? []).filter(entry => entry.id !== id);
	const top = deck.parent_id ? (children.get(null) ?? []) : left;

	await client.query("update marketplace_deck_instances set parent_id = null where id = any($1::uuid[])", [rescued.map(entry => entry.id)]);
	await client.query("delete from decks where id = $1", [id]);
	await numberSiblings(client, [...top, ...rescued]);
	if (deck.parent_id) await numberSiblings(client, left);
	return true;
});

// A marketplace deck taken leaves the library, and the user's progress on it
// with it (they can take it again from the marketplace). What was answered on
// it stays in review_logs, as study done.
const removeTaken = (userId, id) => inTransaction(async client => {
	const library = await lockLibrary(client, userId);
	const taken = library.find(entry => entry.id === id && entry.bought);
	if (!taken) return false;
	const left = (childrenByParent(library).get(taken.parent_id ?? null) ?? []).filter(entry => entry.id !== id);
	await client.query("delete from marketplace_deck_instances where id = $1", [id]);
	await numberSiblings(client, left);
	return true;
});

// The decks inside a deck are taken away and their cards stay: every card
// under it, in reading order, becomes a card of the deck itself, after its
// own. A marketplace deck taken that sat in there is kept, now directly
// inside it.
const flatten = (userId, id) => inTransaction(async client => {
	const library = await lockLibrary(client, userId);
	if (!library.some(entry => entry.id === id && !entry.bought)) throw new Error("Unauthorized");
	const inside = deckSubtree(library, id);
	const under = library.filter(entry => inside.has(entry.id)).map(entry => entry.id === id ? { ...entry, parent_id: null } : entry);
	const own = under.filter(entry => !entry.bought);
	const { rows: cards } = await client.query(
		"select id, deck_id, position from cards where deck_id = any($1::uuid[])", [own.map(entry => entry.id)]);
	cards.sort(byReadingOrder(readingOrder(under)));
	await client.query(`
		update cards c set deck_id = $1, position = u.n
		from unnest($2::uuid[]) with ordinality u(id, n)
		where c.id = u.id`, [id, cards.map(card => card.id)]);
	const kept = deckOutline(under).map(({ deck }) => deck).filter(entry => entry.bought);
	await client.query("update marketplace_deck_instances set parent_id = $1 where id = any($2::uuid[])", [id, kept.map(entry => entry.id)]);
	await numberSiblings(client, kept);
	await client.query("delete from decks where parent_id = $1", [id]);
});

// How the decks inside a deck are studied. A deck of the user's own keeps it
// on the deck; a marketplace deck taken, or one inside it, keeps it as the
// studier's own choice beside the author's.
const setInOrder = async (userId, id, inOrder) => {
	const { rowCount } = await pool.query(
		"update decks set in_order = $3 where id = $2 and user_id = $1", [userId, id, inOrder]);
	if (rowCount === 1) return true;
	const deck = (await getLibrary(userId)).find(entry => entry.id === id && entry.bought);
	if (!deck) return false;
	await pool.query(`
		update marketplace_deck_instances set in_order_overrides = in_order_overrides || jsonb_build_object($3::text, $4::boolean)
		where id = $2 and user_id = $1`, [userId, deck.instance_id, id, inOrder]);
	return true;
}

// How the cards due for review come, said on a deck at the top of the list:
// on a deck of the user's own, its own setting; on a marketplace deck taken,
// the studier's choice beside the author's.
const setReviewsInOrder = async (userId, id, inOrder) => {
	const { rowCount } = await pool.query(
		"update decks set reviews_in_order = $3 where id = $2 and user_id = $1 and parent_id is null", [userId, id, inOrder]);
	if (rowCount === 1) return true;
	const { rowCount: taken } = await pool.query(
		"update marketplace_deck_instances set reviews_in_order = $3 where id = $2 and user_id = $1 and parent_id is null", [userId, id, inOrder]);
	return taken === 1;
}

// The tactic ladder of a deck of the user's own: whole days, or null to take
// the one above's. A marketplace deck's is its author's.
const setTacticLadder = async (userId, id, ladder) => {
	const byId = new Map((await getLibrary(userId)).map(entry => [entry.id, entry]));
	const own = ladder && ladder.join() !== tacticLadder(byId, byId.get(id)?.parent_id).join() ? ladder : null;
	const { rowCount } = await pool.query(
		"update decks set tactic_ladder = $3 where id = $2 and user_id = $1", [userId, id, own]);
	return rowCount === 1;
}

// Every card under a deck back to new, its type kept (that is content, not
// progress), the marketplace decks taken inside it as well: an article is
// unread again. Review history is untouched: it lives in review_logs, keyed
// by card.
const reset = async (userId, id, FSRSValues) => {
	const library = await getLibrary(userId);
	if (!library.some(entry => entry.id === id)) return 0;
	const inside = [...deckSubtree(library, id)];
	const own = library.filter(entry => !entry.bought && inside.includes(entry.id)).map(entry => entry.id);
	const basicSet = `finished_at = null,
		due = $3, stability = $4, difficulty = $5, elapsed_days = $6, scheduled_days = $7,
		reps = $8, lapses = $9, learning_steps = $10, state = $11, last_review = $12`;
	const unscheduledSet = `finished_at = null, due = now(),
		stability = null, difficulty = null, elapsed_days = null, scheduled_days = null,
		reps = null, lapses = null, learning_steps = null, state = null, last_review = null`;
	const ownCards = (set, type) => `
		update cards c set ${set} from decks d
		where c.deck_id = d.id and d.user_id = $1 and d.id = any($2::uuid[]) and (c.card_type = 'basic') = ${type === "basic"}`;
	const boughtCards = (set, type) => `
		update marketplace_card_instances ci set ${set}
		from marketplace_cards mc, marketplace_deck_instances i
		where mc.id = ci.marketplace_card_id and i.id = ci.marketplace_deck_instance_id
			and i.user_id = $1 and ${BOUGHT_DECK} = any($2::uuid[]) and (ci.card_type = 'basic') = ${type === "basic"}`;
	const counts = await Promise.all([
		pool.query(ownCards(basicSet, "basic"), [userId, own, ...FSRSValues]),
		pool.query(ownCards(unscheduledSet, "unscheduled"), [userId, own]),
		pool.query(boughtCards(basicSet, "basic"), [userId, inside, ...FSRSValues]),
		pool.query(boughtCards(unscheduledSet, "unscheduled"), [userId, inside])
	]);
	return counts.reduce((sum, result) => sum + result.rowCount, 0);
}

const userIdOwnsDeckId = async (userId, deckId) => {
	const { rowCount } = await pool.query("select id from decks where id = $1 and user_id = $2", [deckId, userId]);
	return rowCount === 1;
}

// the ids of a deck of the user's own ($2; the user $1) and of their decks
// inside it, as a recursive CTE named `under`
const UNDER = `under(id) as (
	select id from decks where id = $2 and user_id = $1
	union all
	select d.id from decks d join under on d.parent_id = under.id
)`;

// The deck's own listing for its Deck tab, shaped like a marketplace deck's.
// The image itself goes out through the deck's thumbnail route; only a hash
// of it travels here, for the tab to put in that route's url. Its cards are
// every card under it, as publishing it would publish them; holdsTaken says
// a marketplace deck taken sits somewhere inside it, which keeps it off the
// marketplace.
const getOwnListing = async (userId, id) => {
	const { rows } = await pool.query(`
		with recursive ${UNDER}
		select d.id, d.name, d.description, d.theme, left(md5(d.image), 8) "imageVersion", u.name author,
			d.preview_card_ids "previewCardIds",
			(select count(*) from cards c where c.deck_id in (select id from under))::int "cardCount",
			exists (select 1 from marketplace_deck_instances i where i.parent_id in (select id from under)) "holdsTaken"
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

// the deck's sample cards, in the given order; ids that are not cards under
// it are dropped
const updatePreviewCards = async (userId, id, cardIds) => {
	const { rowCount } = await pool.query(`
		with recursive ${UNDER}
		update decks d set preview_card_ids = array(
			select c.id from unnest($3::uuid[]) with ordinality ids(id, n)
			join cards c on c.id = ids.id and c.deck_id in (select id from under)
			order by ids.n
		)
		where d.user_id = $1 and d.id = $2`,
		[userId, id, cardIds]
	);

	return rowCount === 1;
}

// --- cards ---

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
// below list them: a tactic card or an article is due immediately and
// carries no FSRS state (the only_basic_cards_have_fsrs_state constraint
// holds it to that)
const scheduleValues = (cardType, FSRSValues) => cardType === "basic"
	? FSRSValues
	: [new Date(), null, null, null, null, null, null, null, null, null];

// The deck of the user's own that cards are about to land at the end of,
// locked so two arrivals cannot take the same places. `last` is the place of
// its last card.
const landing = async (client, userId, deckId) => {
	const { rowCount } = await client.query("select 1 from decks where id = $1 and user_id = $2 for update", [deckId, userId]);
	if (rowCount !== 1) throw new Error("Unauthorized");
	const { rows: [{ last }] } = await client.query(
		"select coalesce(max(position), 0)::int last from cards where deck_id = $1", [deckId]);
	return last;
}

const INSERT_CARD = `insert into cards(
		deck_id, position, front, back, card_type, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, learning_steps, state, last_review
	) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`;

// one card, at the end of the deck
const addCard = (userId, deckId, front, back, cardType, FSRSValues) => inTransaction(async client => {
	const last = await landing(client, userId, deckId);
	const { rows } = await client.query(`${INSERT_CARD} returning *`,
		[deckId, last + 1, front, back, cardType, ...scheduleValues(cardType, FSRSValues)]);
	return normalizeCard(rows[0]);
});

// Several basic cards at once, in the order given, at the end of the deck.
// All of them or none.
const addCards = (userId, deckId, cards, FSRSValues) => inTransaction(async client => {
	const last = await landing(client, userId, deckId);
	const ids = [];
	for (const [index, card] of cards.entries()) {
		const { rows } = await client.query(`${INSERT_CARD} returning id`,
			[deckId, last + index + 1, JSON.stringify(card.front), JSON.stringify(card.back), "basic", ...FSRSValues]);
		ids.push(rows[0].id);
	}
	return ids;
});

// Switching type restarts the card: the types keep incompatible scheduling
// (a tactic card or an article has no FSRS state at all), so there is nothing to
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

// the cards of these decks numbered 1..n again, in the order they stand
const closeRanks = (client, deckIds) => client.query(`
	update cards c set position = r.position
	from (select id, row_number() over (partition by deck_id order by position) position
		from cards where deck_id = any($1::uuid[])) r
	where c.id = r.id and c.position <> r.position`, [deckIds]);

// the decks they leave close ranks behind them
const deleteCards = (userId, cardIds) => inTransaction(async client => {
	const { rows } = await client.query(`
		delete from cards c
		using decks d
		where c.id = any($2::uuid[]) and c.deck_id = d.id and d.user_id = $1
		returning c.deck_id`,
		[userId, cardIds]
	);
	await closeRanks(client, [...new Set(rows.map(row => row.deck_id))]);
	return rows.length;
});

// The one write behind every reordering gesture — a drag, a typed "3.3", a
// context-menu move, sending cards to another deck: the given cards leave
// where they were and sit down, in the given order, at index (0-based; null
// appends) of the target deck. They are the same cards: schedule and review
// history go with them.
const moveCards = (userId, cardIds, targetDeckId, targetIndex = null) => inTransaction(async client => {
	await landing(client, userId, targetDeckId);
	const { rows: moving } = await client.query(`
		select c.id, c.deck_id from cards c join decks d on d.id = c.deck_id
		where d.user_id = $1 and c.id = any($2::uuid[])`, [userId, cardIds]);
	if (moving.length !== new Set(cardIds).size) throw new Error("Unauthorized");

	const { rows: staying } = await client.query(
		"select id from cards where deck_id = $1 and id <> all($2::uuid[]) order by position", [targetDeckId, cardIds]);
	const order = staying.map(card => card.id);
	order.splice(Math.max(0, Math.min(targetIndex ?? order.length, order.length)), 0, ...new Set(cardIds));
	await client.query(`
		update cards c set deck_id = $1, position = u.n
		from unnest($2::uuid[]) with ordinality u(id, n)
		where c.id = u.id`, [targetDeckId, order]);
	await closeRanks(client, [...new Set(moving.map(card => card.deck_id))].filter(id => id !== targetDeckId));
});

// Copies of cards of the user's own, as new cards: the content and the type,
// none of the progress. They go to the end of the target deck, in the order
// given.
const copyCards = (userId, cardIds, targetDeckId, FSRSValues) => inTransaction(async client => {
	const last = await landing(client, userId, targetDeckId);
	const { rows: cards } = await client.query(`
		select c.id, c.front, c.back, c.card_type from cards c join decks d on d.id = c.deck_id
		where d.user_id = $1 and c.id = any($2::uuid[])`, [userId, cardIds]);
	if (cards.length !== new Set(cardIds).size) throw new Error("Unauthorized");
	const byId = new Map(cards.map(card => [card.id, card]));
	for (const [index, id] of [...new Set(cardIds)].entries()) {
		const card = byId.get(id);
		await client.query(INSERT_CARD,
			[targetDeckId, last + index + 1, JSON.stringify(card.front), card.back == null ? null : JSON.stringify(card.back),
				card.card_type, ...scheduleValues(card.card_type, FSRSValues)]);
	}
});

// Only a card in a deck of the user's own: which deck that is comes from the
// card's row, never from what the caller says of it.
const updateCardStudyState = async (userId, card) => {
	const { rowCount } = await pool.query(`
		update cards c
		set due = $1, stability = $2, difficulty = $3, elapsed_days = $4, scheduled_days = $5, reps = $6, lapses = $7, learning_steps = $8, state = $9, last_review = $10, finished_at = $11
		from decks d
		where c.id = $12 and c.deck_id = d.id and d.user_id = $13
	`, [card.due, card.stability, card.difficulty, card.elapsed_days, card.scheduled_days, card.reps, card.lapses, card.learning_steps, card.state, card.last_review, card.finished_at ?? null, card.id, userId]
	);

	return rowCount === 1;
}

// An article read: finished for good, so it never comes round again. Only a
// card in a deck of the user's own, and only an article.
const markArticleRead = async (userId, cardId) => {
	const { rowCount } = await pool.query(`
		update cards c set last_review = now(), finished_at = now(), due = now()
		from decks d
		where c.id = $2 and c.deck_id = d.id and d.user_id = $1 and c.card_type = 'article'`,
		[userId, cardId]);
	return rowCount === 1;
}

const createReviewLog = async (userId, cardId, log) => {
	await pool.query(`
		insert into review_logs(user_id, card_id, rating, state, due, stability, difficulty, elapsed_days, last_elapsed_days, scheduled_days, learning_steps, review)
		values($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`, [userId, cardId, log.rating, log.state, log.due, log.stability, log.difficulty, log.elapsed_days, log.last_elapsed_days, log.scheduled_days, log.learning_steps, log.review])
}

export { BOUNDS, due, listCounts, BOUGHT_DECK, getLibrary, getListing, getDeck, create, rename, move, remove, removeTaken, flatten, setInOrder, setReviewsInOrder, setTacticLadder, reset, userIdOwnsDeckId, getOwnListing, getImage, updateListing, updatePreviewCards, addCard, addCards, updateCardType, updateCardContent, deleteCards, moveCards, copyCards, updateCardStudyState, markArticleRead, createReviewLog }
