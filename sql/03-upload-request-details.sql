-- Upload requests carry the marketplace listing details (name, description,
-- price, thumbnail); approval copies them into marketplace_decks.
-- Existing marketplace rows predate these required fields (dev/test data only),
-- so they are deleted (keeping personal decks/cards and their review logs).
delete from review_logs where marketplace_card_instance_id is not null;
delete from marketplace_card_instances;
delete from marketplace_deck_instances;
delete from marketplace_cards;
delete from marketplace_decks;
delete from marketplace_upload_requests;

alter table marketplace_upload_requests
	add column name text not null,
	add column description jsonb not null,
	add column price numeric(5,2) check(price >= 0) not null,
	add column image bytea not null,
	add column image_type text not null;

alter table marketplace_decks
	add column description jsonb not null,
	add column image bytea not null,
	add column image_type text not null;
