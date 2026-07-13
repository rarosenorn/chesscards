create table users (
	id uuid primary key default gen_random_uuid(),
	email text not null unique,
	password_hash text not null
);
create table sessions (
	id uuid primary key default gen_random_uuid(),
	user_id uuid references users(id) on delete cascade not null,
	created_at timestamptz default now()
);
create table decks (
	id uuid primary key default gen_random_uuid(),
	user_id uuid references users(id) on delete cascade not null, 
	name text not null,
	unique(user_id, name)
);
create table cards (
	id uuid primary key default gen_random_uuid(),
	deck_id uuid references decks(id) on delete cascade not null,
	front jsonb not null,
	back jsonb,
	due timestamptz not null,
	stability numeric not null,
	difficulty numeric  not null,
	elapsed_days smallint not null,
	scheduled_days smallint not null,
	reps smallint not null,
	lapses smallint not null,
	learning_steps smallint not null,
	state smallint check(state between 0 and 3) not null,
	last_review timestamptz
);
create table marketplace_decks (
	id uuid primary key default gen_random_uuid(),
	user_id uuid references users(id) not null,
	name text not null unique,
	price numeric(5,2) check(price >= 0) not null
);
create table marketplace_cards (
	id uuid default gen_random_uuid() primary key,
	marketplace_deck_id uuid references marketplace_decks(id) on delete cascade not null,
	front text not null,
	back text not null
);
create table marketplace_deck_instances (
	id uuid primary key default gen_random_uuid(),
	user_id uuid references users(id) on delete cascade not null,
	marketplace_deck_id uuid references marketplace_decks(id) not null 
);
create table marketplace_card_instances (
	id uuid default gen_random_uuid() primary key,
	marketplace_deck_id uuid references marketplace_deck_instances(id) on delete cascade not null,
	marketplace_card_id uuid references marketplace_cards(id) on delete cascade not null,
	times_studied int default 0
);
create table review_logs (
	id uuid primary key default gen_random_uuid(),
	user_id uuid references users(id) not null,
	card_id uuid references cards(id),
	marketplace_card_instance_id uuid references marketplace_card_instances(id),
	rating smallint check(rating between 0 and 4) not null,
	state smallint check(state between 0 and 3) not null,
	due timestamptz not null,
	stability numeric not null,
	difficulty numeric not null,
	elapsed_days smallint not null,
	last_elapsed_days smallint not null,
	scheduled_days smallint not null,
	learning_steps smallint not null,
	review timestamptz not null,
	check (card_id is null or marketplace_card_instance_id is null),
	check (card_id is not null or marketplace_card_instance_id is not null)
);
insert into users(id, email, password_hash) values(
	'8be650f6-cce6-4d06-9e4d-99dc712b672f',
	'rasmusrjakobsen@gmail.com',
	'$argon2id$v=19$m=4096,t=3,p=1$c29tZXNhbHQ$rjmkmX9W3mXC5+rKLdFLuQSykbCR5N7WdYpI2R5oEFo'
);
