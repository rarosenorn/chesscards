-- Upload requests carry an ordered list of the deck's card ids chosen as the
-- public preview; approval translates it to preview_order on the copied cards.
alter table marketplace_upload_requests add column preview_card_ids uuid[] not null default '{}';
alter table marketplace_cards add column preview_order smallint;
