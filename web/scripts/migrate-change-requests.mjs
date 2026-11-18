// One-off migration: rename requests become change requests, which also
// carry a new thumbnail, description or sample cards (sql/init.sql has the
// schema it ends at). Run from web/, after a backup:
//
//   node scripts/migrate-change-requests.mjs            # dry run: does it all, checks, rolls back
//   node scripts/migrate-change-requests.mjs --apply    # the same, committed

import "dotenv/config"
import pg from "pg"

const apply = process.argv.includes("--apply");
const client = new pg.Client();
await client.connect();

try {
	await client.query("begin");
	const { rows: [before] } = await client.query("select count(*)::int n from marketplace_rename_requests");
	await client.query(`
		alter table marketplace_rename_requests rename to marketplace_change_requests;
		alter index marketplace_rename_requests_pkey rename to marketplace_change_requests_pkey;
		alter index marketplace_rename_requests_pending_key rename to marketplace_change_requests_pending_key;
		alter table marketplace_change_requests rename constraint marketplace_rename_requests_marketplace_deck_id_fkey to marketplace_change_requests_marketplace_deck_id_fkey;
		alter table marketplace_change_requests rename constraint marketplace_rename_requests_status_check to marketplace_change_requests_status_check;
		alter table marketplace_change_requests alter column name drop not null;
		alter table marketplace_change_requests
			add column description jsonb,
			add column image bytea,
			add column image_type text,
			add column preview_card_ids uuid[],
			add constraint marketplace_change_requests_something_check
				check (name is not null or description is not null or image is not null or preview_card_ids is not null),
			add constraint marketplace_change_requests_image_check
				check ((image is null) = (image_type is null));
	`);
	const { rows: [after] } = await client.query("select count(*)::int n from marketplace_change_requests");
	if (after.n !== before.n) throw new Error(`requests ${before.n} -> ${after.n}`);
	console.log(`${after.n} requests carried over`);
	await client.query(apply ? "commit" : "rollback");
	console.log(apply ? "applied" : "dry run: rolled back");
} catch (err) {
	await client.query("rollback");
	throw err;
} finally {
	await client.end();
}
