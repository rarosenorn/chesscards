create type deck_theme as enum ('openings', 'endgames', 'tactics', 'strategy', 'checkmates');

alter table users add column is_admin boolean not null default false;

create table marketplace_upload_requests (
	id uuid primary key default gen_random_uuid(),
	deck_id uuid references decks(id) on delete cascade not null,
	user_id uuid references users(id) on delete cascade not null,
	theme deck_theme not null,
	status text check(status in ('pending', 'approved', 'rejected')) not null default 'pending',
	created_at timestamptz not null default now()
);

alter table marketplace_decks add column theme deck_theme not null;
alter table marketplace_cards
	alter column front type jsonb using front::jsonb,
	alter column back type jsonb using back::jsonb,
	alter column back drop not null;

alter table marketplace_card_instances rename column marketplace_deck_id to marketplace_deck_instance_id;
alter table marketplace_card_instances
	drop column times_studied,
	add column due timestamptz not null,
	add column stability numeric not null,
	add column difficulty numeric not null,
	add column elapsed_days smallint not null,
	add column scheduled_days smallint not null,
	add column reps smallint not null,
	add column lapses smallint not null,
	add column learning_steps smallint not null,
	add column state smallint check(state between 0 and 3) not null,
	add column last_review timestamptz;

update users set is_admin = true where email = 'rasmusrjakobsen@gmail.com';
