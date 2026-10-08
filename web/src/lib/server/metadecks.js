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
		select id, name, study_order "studyOrder" from metadecks
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

// What a metadeck holds, said whole: the given decks, marketplace decks and
// metadecks, all of them the user's, replace whatever it held. A metadeck
// never goes inside itself or inside one it holds, by whatever way.
const setItems = async (userId, id, { deckIds, instanceIds, metadeckIds }) => {
	const client = await pool.connect();
	try {
		await client.query("begin");
		const { rowCount: owned } = await client.query(
			"select 1 from metadecks where id = $2 and user_id = $1 for update", [userId, id]);
		if (owned !== 1) throw new Error("Unauthorized");
		const closed = holders(await getMine(userId), id);
		if (metadeckIds.some(metadeckId => closed.has(metadeckId))) throw new Error("A metadeck cannot go inside itself");

		await client.query("delete from metadeck_items where metadeck_id = $1", [id]);
		// each insert takes only what is the user's, so a stray id adds nothing
		const { rowCount } = await client.query(`
			with added_decks as (
				insert into metadeck_items(metadeck_id, deck_id)
				select $2, d.id from decks d where d.user_id = $1 and d.id = any($3::uuid[])
				returning 1
			), added_instances as (
				insert into metadeck_items(metadeck_id, marketplace_deck_instance_id)
				select $2, i.id from marketplace_deck_instances i where i.user_id = $1 and i.id = any($4::uuid[])
				returning 1
			), added_metadecks as (
				insert into metadeck_items(metadeck_id, child_metadeck_id)
				select $2, m.id from metadecks m where m.user_id = $1 and m.id = any($5::uuid[])
				returning 1
			)
			select 1 from added_decks union all select 1 from added_instances union all select 1 from added_metadecks`,
			[userId, id, deckIds, instanceIds, metadeckIds]);
		if (rowCount !== deckIds.length + instanceIds.length + metadeckIds.length) throw new Error("Unauthorized");
		await client.query("commit");
	} catch (err) {
		await client.query("rollback");
		throw err;
	} finally {
		client.release();
	}
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
		isMetadeck: true,
		parts: parts.map(({ id, name, subdecks, usesSubdecks, progressionDepth }) =>
			({ id, name, subdecks, usesSubdecks, progressionDepth })),
		subdecks: parts.flatMap(part => part.subdecks),
		cards: parts.flatMap(part => part.cards)
	};
}

export { getMine, create, rename, remove, setStudyOrder, reorder, setItems, getForStudy }
