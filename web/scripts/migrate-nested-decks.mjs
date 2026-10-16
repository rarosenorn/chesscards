// One-off migration to nested decks (sql/init.sql has the schema it ends at).
// Run from web/, after a backup:
//
//   node scripts/migrate-nested-decks.mjs            # dry run: does it all, checks, rolls back
//   node scripts/migrate-nested-decks.mjs --apply    # the same, committed
//
// - Every subdeck becomes a deck inside its old deck (same id, so a card's
//   subdeck_id is its new deck_id, and links and cram records still match).
//   A deck that had its subdecks switched off has them dropped and their
//   cards gathered in it, in the order they read.
// - Progression depth becomes in order / mixed on each deck that has decks
//   inside: in order down to the depth, mixed below it.
// - A metadeck becomes a deck (same id) holding what it held: mix is mixed,
//   in-order is in order. A deck that sat in several goes to the first.
// - A marketplace deck's subdecks keep their table, with in order / mixed
//   from the author's depth; a studier's own depth is kept where it differs.
// - Names that now meet among siblings get " (2)", " (3)", ...

import "dotenv/config"
import pg from "pg"

const apply = process.argv.includes("--apply");
const client = new pg.Client();
await client.connect();

// in order at this level (0 = the deck itself) for a progression depth
// (null = every level)
const inOrderAt = (depth, level) => depth == null || depth >= level + 1;

// a tree's rows in reading order with their levels (1 = top level)
const outline = rows => {
	const children = new Map();
	for (const row of rows) {
		const parent = row.parent_id ?? null;
		if (!children.has(parent)) children.set(parent, []);
		children.get(parent).push(row);
	}
	for (const list of children.values()) list.sort((a, b) => a.position - b.position);
	const out = [];
	const walk = (parent, level) => {
		for (const row of children.get(parent) ?? []) {
			out.push({ row, level });
			walk(row.id, level + 1);
		}
	}
	walk(null, 1);
	return out;
}

const log = [];
try {
	await client.query("begin");
	const q = (text, values) => client.query(text, values);

	const before = (await q("select count(*)::int n from cards")).rows[0].n;

	await q(`alter table decks add column parent_id uuid references decks(id) on delete cascade`);
	await q(`alter table decks add column in_order boolean not null default true`);
	await q(`alter table decks drop constraint decks_user_id_name_key`);
	await q(`alter table marketplace_decks add column in_order boolean not null default true`);
	await q(`alter table marketplace_subdecks add column in_order boolean not null default true`);
	await q(`alter table marketplace_cards alter column subdeck_id drop not null`);
	await q(`alter table marketplace_deck_instances add column parent_id uuid references decks(id) on delete set null`);
	await q(`alter table marketplace_deck_instances add column in_order_overrides jsonb not null default '{}'`);

	// --- own decks and their subdecks ---
	const { rows: decks } = await q(`select id, user_id, name, position, uses_subdecks, progression_depth from decks`);
	const { rows: subdecks } = await q(`select id, deck_id, parent_id, name, position, intro from subdecks`);
	for (const deck of decks) {
		const own = subdecks.filter(subdeck => subdeck.deck_id === deck.id);
		if (deck.uses_subdecks) {
			await q(`update decks set in_order = $2 where id = $1`, [deck.id, inOrderAt(deck.progression_depth, 0)]);
			for (const { row, level } of outline(own)) {
				await q(`insert into decks(id, user_id, name, parent_id, position, in_order, intro) values ($1, $2, $3, $4, $5, $6, $7)`,
					[row.id, deck.user_id, row.name, row.parent_id ?? deck.id, row.position,
						inOrderAt(deck.progression_depth, level), row.intro && JSON.stringify(row.intro)]);
			}
			await q(`update cards set deck_id = subdeck_id where deck_id = $1`, [deck.id]);
			log.push(`${deck.name}: ${own.length} subdeck(s) became decks inside it`);
		} else {
			// hidden subdecks: their cards gather in the deck, in reading order
			const order = new Map(outline(own).map(({ row }, index) => [row.id, index]));
			const { rows: cards } = await q(`select id, subdeck_id, position from cards where deck_id = $1`, [deck.id]);
			cards.sort((a, b) => order.get(a.subdeck_id) - order.get(b.subdeck_id) || a.position - b.position);
			await q(`update cards c set position = u.n from unnest($1::uuid[]) with ordinality u(id, n) where c.id = u.id`,
				[cards.map(card => card.id)]);
			if (own.length > 1) log.push(`${deck.name}: ${own.length} hidden subdecks gathered into the deck`);
		}
	}

	// --- metadecks ---
	const { rows: metadecks } = await q(`select id, user_id, name, position, study_order from metadecks order by position, name`);
	const { rows: instances } = await q(`select id, user_id, marketplace_deck_id, position, progression_depth from marketplace_deck_instances`);
	const { rows: items } = await q(`
		select i.metadeck_id, 'metadeck' kind, 0 kind_order, c.id, c.position
		from metadeck_items i join metadecks c on c.id = i.child_metadeck_id
		union all
		select i.metadeck_id, 'instance', 1, di.id, di.position
		from metadeck_items i join marketplace_deck_instances di on di.id = i.marketplace_deck_instance_id
		union all
		select i.metadeck_id, 'deck', 2, d.id, d.position
		from metadeck_items i join decks d on d.id = i.deck_id
		order by kind_order, position`);
	for (const metadeck of metadecks) {
		await q(`insert into decks(id, user_id, name, position, in_order) values ($1, $2, $3, 0, $4)`,
			[metadeck.id, metadeck.user_id, metadeck.name, metadeck.study_order === "in-order"]);
	}
	// each thing's parent: the first metadeck holding it, in their order
	const parentOf = new Map();
	const childrenOf = new Map();
	for (const metadeck of metadecks) {
		childrenOf.set(metadeck.id, []);
		for (const item of items.filter(entry => entry.metadeck_id === metadeck.id)) {
			if (parentOf.has(item.id)) {
				log.push(`a ${item.kind} in several metadecks went into the first only (${item.id})`);
				continue;
			}
			parentOf.set(item.id, metadeck.id);
			childrenOf.get(metadeck.id).push(item);
		}
	}
	for (const [metadeckId, children] of childrenOf) {
		for (const [index, child] of children.entries()) {
			const table = child.kind === "instance" ? "marketplace_deck_instances" : "decks";
			await q(`update ${table} set parent_id = $2, position = $3 where id = $1`, [child.id, metadeckId, index + 1]);
		}
	}
	// the top of each user's list: their decks, then the marketplace decks,
	// then the metadecks, as My flashcards showed them
	const users = new Set([...decks, ...instances, ...metadecks].map(row => row.user_id));
	for (const userId of users) {
		const top = [
			...decks.filter(deck => deck.user_id === userId && !parentOf.has(deck.id)).sort((a, b) => a.position - b.position)
				.map(deck => ({ table: "decks", id: deck.id })),
			...instances.filter(instance => instance.user_id === userId && !parentOf.has(instance.id)).sort((a, b) => a.position - b.position)
				.map(instance => ({ table: "marketplace_deck_instances", id: instance.id })),
			...metadecks.filter(metadeck => metadeck.user_id === userId && !parentOf.has(metadeck.id))
				.map(metadeck => ({ table: "decks", id: metadeck.id }))
		];
		for (const [index, entry] of top.entries()) {
			await q(`update ${entry.table} set position = $2 where id = $1`, [entry.id, index + 1]);
		}
	}

	// names that now meet among siblings
	const { rows: clashes } = await q(`
		select id, name, n from (
			select id, name, row_number() over (partition by user_id, parent_id, name order by position, id) n from decks
		) d where n > 1`);
	for (const clash of clashes) {
		let n = clash.n;
		const { rows: [{ user_id, parent_id }] } = await q(`select user_id, parent_id from decks where id = $1`, [clash.id]);
		while ((await q(`select 1 from decks where user_id = $1 and parent_id is not distinct from $2 and name = $3`,
			[user_id, parent_id, `${clash.name} (${n})`])).rowCount) n++;
		await q(`update decks set name = $2 where id = $1`, [clash.id, `${clash.name} (${n})`]);
		log.push(`renamed "${clash.name}" to "${clash.name} (${n})" beside a deck of the same name`);
	}

	// --- marketplace decks ---
	const { rows: mpDecks } = await q(`select id, name, uses_subdecks, progression_depth from marketplace_decks`);
	const { rows: mpSubdecks } = await q(`select id, marketplace_deck_id, parent_id, position from marketplace_subdecks`);
	const authorInOrder = new Map();
	for (const mpDeck of mpDecks) {
		const own = outline(mpSubdecks.filter(subdeck => subdeck.marketplace_deck_id === mpDeck.id));
		if (mpDeck.uses_subdecks) {
			const levels = new Map([[mpDeck.id, 0], ...own.map(({ row, level }) => [row.id, level])]);
			authorInOrder.set(mpDeck.id, { levels, depth: mpDeck.progression_depth });
			await q(`update marketplace_decks set in_order = $2 where id = $1`, [mpDeck.id, inOrderAt(mpDeck.progression_depth, 0)]);
			for (const { row, level } of own) {
				await q(`update marketplace_subdecks set in_order = $2 where id = $1`, [row.id, inOrderAt(mpDeck.progression_depth, level)]);
			}
		} else {
			const order = new Map(own.map(({ row }, index) => [row.id, index]));
			const { rows: cards } = await q(`select id, subdeck_id, position from marketplace_cards where marketplace_deck_id = $1`, [mpDeck.id]);
			cards.sort((a, b) => order.get(a.subdeck_id) - order.get(b.subdeck_id) || a.position - b.position);
			await q(`update marketplace_cards c set subdeck_id = null, position = u.n from unnest($1::uuid[]) with ordinality u(id, n) where c.id = u.id`,
				[cards.map(card => card.id)]);
			await q(`delete from marketplace_subdecks where marketplace_deck_id = $1`, [mpDeck.id]);
		}
	}
	// a studier's own depth, where it differs from the author's
	for (const instance of instances) {
		const author = authorInOrder.get(instance.marketplace_deck_id);
		if (!author) continue;
		const overrides = {};
		for (const [id, level] of author.levels) {
			const mine = inOrderAt(instance.progression_depth, level);
			if (mine !== inOrderAt(author.depth, level)) overrides[id === instance.marketplace_deck_id ? instance.id : id] = mine;
		}
		if (Object.keys(overrides).length) {
			await q(`update marketplace_deck_instances set in_order_overrides = $2 where id = $1`, [instance.id, JSON.stringify(overrides)]);
		}
	}

	// --- cram records: what was crammed is now a deck of its own ---
	await q(`update cram_sessions set studied = subdeck where subdeck is not null`);

	// --- what goes ---
	await q(`alter table cram_sessions drop column subdeck`);
	await q(`alter table cards drop column subdeck_id`);
	await q(`drop table subdecks`);
	await q(`alter table decks drop column uses_subdecks, drop column progression_depth`);
	await q(`alter table marketplace_decks drop column uses_subdecks, drop column progression_depth`);
	await q(`alter table marketplace_deck_instances drop column progression_depth`);
	await q(`drop table metadeck_items`);
	await q(`drop table metadecks`);
	await q(`alter table "user" drop column "subdeckProgressionMode"`);
	await q(`drop index if exists marketplace_deck_instances_user_id_idx`);

	await q(`alter table decks add constraint decks_user_id_parent_id_name_key unique nulls not distinct (user_id, parent_id, name)`);
	await q(`alter table marketplace_deck_instances add constraint marketplace_deck_instances_user_id_marketplace_deck_id_key unique (user_id, marketplace_deck_id)`);
	await q(`create index decks_parent_id_idx on decks (parent_id)`);
	await q(`create index marketplace_deck_instances_parent_id_idx on marketplace_deck_instances (parent_id)`);

	// --- checks ---
	const after = (await q("select count(*)::int n from cards")).rows[0].n;
	if (after !== before) throw new Error(`cards: ${before} before, ${after} after`);
	const { rows: [{ foreign }] } = await q(`
		select count(*)::int "foreign" from decks d join decks p on p.id = d.parent_id where p.user_id <> d.user_id`);
	if (foreign) throw new Error(`${foreign} deck(s) inside another user's deck`);
	const { rows: [{ strays }] } = await q(`
		select count(*)::int strays from marketplace_deck_instances i join decks p on p.id = i.parent_id where p.user_id <> i.user_id`);
	if (strays) throw new Error(`${strays} marketplace deck(s) inside another user's deck`);
	const { rows: [{ loops }] } = await q(`
		with recursive up(id, ancestor, depth) as (
			select id, parent_id, 1 from decks where parent_id is not null
			union all
			select up.id, d.parent_id, up.depth + 1 from up join decks d on d.id = up.ancestor
			where d.parent_id is not null and up.depth < 100
		) select count(*)::int loops from up where id = ancestor`);
	if (loops) throw new Error(`${loops} deck(s) inside themselves`);

	console.log(log.join("\n"));
	console.log(`\ncards: ${after}, checks passed`);
	await q(apply ? "commit" : "rollback");
	console.log(apply ? "applied" : "dry run: rolled back (--apply to write)");
} catch (err) {
	await client.query("rollback");
	console.error(err);
	process.exitCode = 1;
} finally {
	await client.end();
}
