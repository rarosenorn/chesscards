// One-off: deck intros become Article cards (card_type 'article'), and the
// intro columns go. Run from web/:
//
//   node scripts/migrate-intros-to-articles.mjs            # dry run
//   node scripts/migrate-intros-to-articles.mjs --apply    # write
//
// Each deck's intro becomes an Article at position 1 of that deck's own
// cards, the rest moving down one. An intro already met (a card under its
// deck studied) becomes an Article already read. Marketplace decks and the
// decks inside them get theirs the same way, with a copy for every studier
// who has taken the deck, read where that studier has begun the deck.

import "dotenv/config"
import pg from "pg"

const apply = process.argv.includes("--apply")
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

const SEEN = c => `case when ${c}.card_type = 'basic' then ${c}.state <> 0
	else ${c}.finished_at is not null or ${c}.last_review is not null end`

try {
	await client.query("begin")

	const { rows: [{ has }] } = await client.query(`
		select count(*) > 0 has from information_schema.columns where table_name = 'decks' and column_name = 'intro'`)
	if (!has) throw new Error("already migrated: decks.intro is gone")

	await client.query(`
		alter table cards drop constraint cards_card_type_check;
		alter table cards add constraint cards_card_type_check check (card_type in ('basic', 'tactic', 'article'));
		alter table cards drop constraint tactic_cards_have_no_fsrs_state;
		alter table cards add constraint only_basic_cards_have_fsrs_state check ((card_type = 'basic') = (state is not null));
		alter table marketplace_cards drop constraint marketplace_cards_card_type_check;
		alter table marketplace_cards add constraint marketplace_cards_card_type_check check (card_type in ('basic', 'tactic', 'article'));
		alter table marketplace_card_instances drop constraint marketplace_card_instances_card_type_check;
		alter table marketplace_card_instances add constraint marketplace_card_instances_card_type_check check (card_type in ('basic', 'tactic', 'article'));
		alter table marketplace_card_instances drop constraint tactic_instances_have_no_fsrs_state;
		alter table marketplace_card_instances add constraint only_basic_instances_have_fsrs_state check ((card_type = 'basic') = (state is not null));`)

	// --- the user's own decks ---
	const { rows: own } = await client.query(`
		select d.id, d.name, d.intro,
			exists (
				with recursive under(id) as (
					select d.id union all select k.id from decks k join under on k.parent_id = under.id
				)
				select 1 from cards c where c.deck_id in (select id from under) and ${SEEN("c")}
			) begun
		from decks d
		where d.intro is not null and jsonb_array_length(d.intro) > 0`)
	for (const deck of own) {
		await client.query("update cards set position = position + 1 where deck_id = $1", [deck.id])
		await client.query(`
			insert into cards(deck_id, position, front, back, card_type, due, last_review, finished_at)
			values ($1, 1, $2, null, 'article', now(), $3, $3)`,
			[deck.id, JSON.stringify(deck.intro), deck.begun ? new Date() : null])
		console.log(`deck "${deck.name}": article${deck.begun ? " (read)" : ""}`)
	}

	// --- marketplace decks and the decks inside them ---
	const { rows: published } = await client.query(`
		select md.id marketplace_deck_id, null::uuid subdeck_id, md.name, md.intro
		from marketplace_decks md where md.intro is not null and jsonb_array_length(md.intro) > 0
		union all
		select ms.marketplace_deck_id, ms.id, ms.name, ms.intro
		from marketplace_subdecks ms where ms.intro is not null and jsonb_array_length(ms.intro) > 0`)
	for (const deck of published) {
		await client.query(`
			update marketplace_cards set position = position + 1
			where marketplace_deck_id = $1 and subdeck_id is not distinct from $2`,
			[deck.marketplace_deck_id, deck.subdeck_id])
		const { rows: [card] } = await client.query(`
			insert into marketplace_cards(marketplace_deck_id, subdeck_id, position, front, back, card_type)
			values ($1, $2, 1, $3, null, 'article') returning id`,
			[deck.marketplace_deck_id, deck.subdeck_id, JSON.stringify(deck.intro)])
		// every copy taken, read where its studier has begun what it introduces
		const { rowCount } = await client.query(`
			with recursive under(id) as (
				select $3::uuid where $3::uuid is not null
				union all select ms.id from marketplace_subdecks ms join under on ms.parent_id = under.id
			)
			insert into marketplace_card_instances(marketplace_deck_instance_id, marketplace_card_id, card_type, due, last_review, finished_at)
			select i.id, $1, 'article', now(), begun.at, begun.at
			from marketplace_deck_instances i
			cross join lateral (select case when exists (
				select 1 from marketplace_card_instances ci
				join marketplace_cards mc on mc.id = ci.marketplace_card_id
				where ci.marketplace_deck_instance_id = i.id and ${SEEN("ci")}
					and ($3::uuid is null or mc.subdeck_id in (select id from under))
			) then now() end at) begun
			where i.marketplace_deck_id = $2`,
			[card.id, deck.marketplace_deck_id, deck.subdeck_id])
		console.log(`marketplace "${deck.name}": article, ${rowCount} cop${rowCount === 1 ? "y" : "ies"}`)
	}

	await client.query(`
		alter table decks drop column intro;
		alter table marketplace_decks drop column intro;
		alter table marketplace_subdecks drop column intro;`)

	await client.query(apply ? "commit" : "rollback")
	console.log(apply ? "done" : "DRY RUN — rolled back. Re-run with --apply to write.")
} catch (e) {
	await client.query("rollback")
	throw e
} finally {
	await client.end()
}
