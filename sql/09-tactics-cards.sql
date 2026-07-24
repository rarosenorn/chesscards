-- Tactic cards: graded Correct/Incorrect instead of FSRS. Correct finishes
-- the card for good (finished_at); Incorrect re-queues it a day later. They
-- carry no FSRS memory state, so the FSRS columns become nullable and stay
-- null for them (state is the constraint's representative for the group).

alter table cards
	add column card_type text not null default 'basic' check (card_type in ('basic', 'tactic')),
	add column finished_at timestamptz,
	alter column stability drop not null,
	alter column difficulty drop not null,
	alter column elapsed_days drop not null,
	alter column scheduled_days drop not null,
	alter column reps drop not null,
	alter column lapses drop not null,
	alter column learning_steps drop not null,
	alter column state drop not null,
	add constraint tactic_cards_have_no_fsrs_state check ((card_type = 'tactic') = (state is null));

alter table marketplace_cards
	add column card_type text not null default 'basic' check (card_type in ('basic', 'tactic'));

alter table marketplace_card_instances
	add column card_type text not null default 'basic' check (card_type in ('basic', 'tactic')),
	add column finished_at timestamptz,
	alter column stability drop not null,
	alter column difficulty drop not null,
	alter column elapsed_days drop not null,
	alter column scheduled_days drop not null,
	alter column reps drop not null,
	alter column lapses drop not null,
	alter column learning_steps drop not null,
	alter column state drop not null,
	add constraint tactic_instances_have_no_fsrs_state check ((card_type = 'tactic') = (state is null));

-- tactic reviews log only rating + review time (+ due when re-queued)
alter table review_logs
	alter column state drop not null,
	alter column due drop not null,
	alter column stability drop not null,
	alter column difficulty drop not null,
	alter column elapsed_days drop not null,
	alter column last_elapsed_days drop not null,
	alter column scheduled_days drop not null,
	alter column learning_steps drop not null;
