import { pool } from "./pool.js"
import * as decks from "./decks.js"
import * as marketplace from "./marketplace.js"
import { resolveDecks, holders } from "../metadecks.js"

// A metadeck is its owner's grouping of decks and other metadecks, for
// studying them together (see lib/metadecks.js for the shape used here and
// sql/init.sql for the tables).

// The user's metadecks in their order, each with what it holds: the
// metadecks inside it first, then the marketplace decks, then their own
// decks, each group in the order it stands in My flashcards. That order is
// the metadeck's own: what "in order" study follows.
const getMine = async userId => {
	const { rows: metadecks } = await pool.query(`
		select id, name, study_order "studyOrder", reviews_first "reviewsFirst" from metadecks
		where user_id = $1 order by position, name`, [userId]);
	const { rows: items } = await pool.query(`
		select i.metadeck_id, 'metadeck' kind, 0 kind_order, c.id, c.position
		from metadeck_items i join metadecks m on m.id = i.metadeck_id join metadecks c on c.id = i.child_metadeck_id
		where m.user_id = $1
		union all
		select i.metadeck_id, 'instance', 1, di.id, di.position
		from metadeck_items i join metadecks m on m.id = i.metadeck_id join marketplace_deck_instances di on di.id = i.marketplace_deck_instance_id
		where m.user_id = $1
		union all
		select i.metadeck_id, 'deck', 2, d.id, d.position
		from metadeck_items i join metadecks m on m.id = i.metadeck_id join decks d on d.id = i.deck_id
		where m.user_id = $1
		order by kind_order, position`, [userId]);

	return metadecks.map(metadeck => ({
		...metadeck,
		items: items.filter(item => item.metadeck_id === metadeck.id).map(({ kind, id }) => ({ kind, id }))
	}));
}

const create = async (userId, name) => {
	const { rows } = await pool.query(`
		insert into metadecks(user_id, name, position)
		values ($1, $2, (select coalesce(max(position), 0) + 1 from metadecks where user_id = $1))
		returning id, name`, [userId, name]);

	return rows[0];
}

const rename = async (userId, id, name) => {
	const { rowCount } = await pool.query(
		"update metadecks set name = $3 where id = $2 and user_id = $1", [userId, id, name]);

	return rowCount === 1;
}

// only the grouping goes: the decks it held are untouched
const remove = async (userId, id) => {
	const { rowCount } = await pool.query(
		"delete from metadecks where id = $2 and user_id = $1", [userId, id]);

	return rowCount === 1;
}

// 'mix': its decks' cards come as one deck's would. 'in-order': deck after deck.
const setStudyOrder = async (userId, id, studyOrder) => {
	const { rowCount } = await pool.query(
		"update metadecks set study_order = $3 where id = $2 and user_id = $1", [userId, id, studyOrder]);

	return rowCount === 1;
}

// In order only: whether due reviews come from all its decks before the new
// cards, or wait their deck's turn as the new cards do.
const setReviewsFirst = async (userId, id, reviewsFirst) => {
	const { rowCount } = await pool.query(
		"update metadecks set reviews_first = $3 where id = $2 and user_id = $1", [userId, id, reviewsFirst]);

	return rowCount === 1;
}

// the user's metadecks in the order given (see decks.reorder)
const reorder = async (userId, ids) => {
	const { rowCount } = await pool.query(`
		update metadecks m set position = u.n
		from unnest($2::uuid[]) with ordinality u(id, n)
		where m.id = u.id and m.user_id = $1
			and (select count(*) from metadecks where user_id = $1) = cardinality($2::uuid[])`,
		[userId, ids]);

	return rowCount === ids.length;
}

// The three kinds of thing a metadeck holds: the column that names one in
// metadeck_items, and the table in which it is the user's.
const KINDS = {
	deck: { column: "deck_id", table: "decks" },
	instance: { column: "marketplace_deck_instance_id", table: "marketplace_deck_instances" },
	metadeck: { column: "child_metadeck_id", table: "metadecks" }
};

// One thing of the user's goes into a metadeck of theirs, and with `fromId`
// leaves that metadeck for it. A metadeck never goes inside itself or inside
// one it holds, by whatever way. Something already inside stays as it is.
const addItem = async (userId, id, kind, itemId, fromId = null) => {
	const { column, table } = KINDS[kind];
	const client = await pool.connect();
	try {
		await client.query("begin");
		// all of the user's metadecks are held, not this one alone: two changes
		// at once could otherwise each put the other's metadeck inside its own
		const { rows: locked } = await client.query(
			"select id from metadecks where user_id = $1 for update", [userId]);
		const mine = new Set(locked.map(metadeck => metadeck.id));
		if (!mine.has(id) || (fromId && !mine.has(fromId))) throw new Error("Unauthorized");
		if (kind === "metadeck" && holders(await getMine(userId), id).has(itemId)) {
			throw new Error("A metadeck cannot go inside itself");
		}
		const { rowCount: owned } = await client.query(
			`select 1 from ${table} where id = $2 and user_id = $1`, [userId, itemId]);
		if (owned !== 1) throw new Error("Unauthorized");

		await client.query(
			`insert into metadeck_items(metadeck_id, ${column}) values ($1, $2) on conflict do nothing`, [id, itemId]);
		if (fromId && fromId !== id) {
			await client.query(`delete from metadeck_items where metadeck_id = $1 and ${column} = $2`, [fromId, itemId]);
		}
		await client.query("commit");
	} catch (err) {
		await client.query("rollback");
		throw err;
	} finally {
		client.release();
	}
}

// it leaves the metadeck; the thing itself is untouched
const removeItem = async (userId, id, kind, itemId) => {
	const { rowCount } = await pool.query(`
		delete from metadeck_items i using metadecks m
		where m.id = i.metadeck_id and m.user_id = $1 and i.metadeck_id = $2 and i.${KINDS[kind].column} = $3`,
		[userId, id, itemId]);

	return rowCount === 1;
}

// A metadeck as study takes it: shaped like a deck (see decks.getById), its
// cards those of every deck it comes to, each deck's in its own reading
// order. `parts` are those decks in the metadeck's order, each with what
// progression needs of it, since each keeps its own; a card says which part
// it is of by its deck_id or its marketplace_deck_instance_id.
const getForStudy = async (userId, id) => {
	const mine = await getMine(userId);
	const metadeck = mine.find(candidate => candidate.id === id);
	if (!metadeck) return undefined;

	const parts = [];
	for (const item of resolveDecks(mine, id)) {
		const deck = item.kind === "deck"
			? await decks.getById(userId, item.id)
			: await marketplace.getInstanceById(userId, item.id);
		if (deck) parts.push(deck);
	}

	return {
		id: metadeck.id,
		name: metadeck.name,
		studyOrder: metadeck.studyOrder,
		reviewsFirst: metadeck.reviewsFirst,
		isMetadeck: true,
		parts: parts.map(({ id, name, subdecks, usesSubdecks, progressionDepth, intro }) =>
			({ id, name, subdecks, usesSubdecks, progressionDepth, intro })),
		subdecks: parts.flatMap(part => part.subdecks),
		cards: parts.flatMap(part => part.cards)
	};
}

export { KINDS, getMine, create, rename, remove, setStudyOrder, setReviewsFirst, reorder, addItem, removeItem, getForStudy }
