import { pool } from "./pool.js"

// What a user has done day by day, for the activity heatmap: every answer
// saved as a review (review_logs) and every answer given as practice in a
// cram session (practice_logs). And what is to come: how many of their cards
// fall due on each day ahead.

// The study day an instant falls in, as text: in the user's zone, the day
// turning at their rollover hour (as BOUNDS in decks.js reads "today").
const studyDay = (at, zone, hour) =>
	`to_char(date_trunc('day', (${at} at time zone ${zone}) - make_interval(hours => ${hour})), 'YYYY-MM-DD')`;

// Every day the user answered anything, oldest first, each { day, count };
// every day from today on that cards of theirs fall due on, each
// { day, count } (cards already met and not finished: a card never studied
// has no day of its own to come, and one overdue has had its day); and the
// study day it is now.
const getDailyCounts = async (userId, { timeZone, rolloverHour }) => {
	const { rows: days } = await pool.query(`
		select day, sum(n)::int count from (
			select ${studyDay("review", "$2", "$3")} as day, count(*) n from review_logs where user_id = $1 group by 1
			union all
			select ${studyDay("answered", "$2", "$3")} as day, count(*) n from practice_logs where user_id = $1 group by 1
		) answers
		group by day order by day`, [userId, timeZone, rolloverHour]);
	const { rows: [{ today }] } = await pool.query(
		`select ${studyDay("now()", "$1", "$2")} as today`, [timeZone, rolloverHour]);
	const { rows: due } = await pool.query(`
		select day, sum(n)::int count from (
			select ${studyDay("c.due", "$2", "$3")} as day, count(*) n
			from cards c join decks d on d.id = c.deck_id
			where d.user_id = $1 and c.last_review is not null and c.finished_at is null
			group by 1
			union all
			select ${studyDay("ci.due", "$2", "$3")} as day, count(*) n
			from marketplace_card_instances ci
			join marketplace_deck_instances i on i.id = ci.marketplace_deck_instance_id
			where i.user_id = $1 and ci.last_review is not null and ci.finished_at is null
			group by 1
		) cards
		group by day order by day`, [userId, timeZone, rolloverHour]);

	return { days, forecast: due.filter(({ day }) => day >= today), today };
}

// one practice answer, to a card of the user's own or of a marketplace deck
// they have taken
const logPractice = async (userId, cardId, isInstance, gotIt) => {
	const { rowCount } = await pool.query(isInstance ? `
		insert into practice_logs(user_id, marketplace_card_instance_id, got_it)
		select $1, ci.id, $3
		from marketplace_card_instances ci
		join marketplace_deck_instances i on i.id = ci.marketplace_deck_instance_id
		where ci.id = $2 and i.user_id = $1` : `
		insert into practice_logs(user_id, card_id, got_it)
		select $1, c.id, $3
		from cards c join decks d on d.id = c.deck_id
		where c.id = $2 and d.user_id = $1`, [userId, cardId, gotIt]);

	return rowCount === 1;
}

// A cram session has been gone through to the end, on `studied` (a deck of
// the user's own, a marketplace deck taken, or a deck inside one). It is
// noted, and the answer is how many that makes on the same deck in the study
// day it is now.
const completeCramSession = async (userId, studied, { timeZone, rolloverHour }) => {
	await pool.query(
		"insert into cram_sessions(user_id, studied) values ($1, $2)", [userId, studied]);
	const { rows: [{ count }] } = await pool.query(`
		select count(*)::int count from cram_sessions
		where user_id = $1 and studied = $4
			and ${studyDay("completed", "$2", "$3")} = ${studyDay("now()", "$2", "$3")}`,
		[userId, timeZone, rolloverHour, studied]);

	return count;
}

export { getDailyCounts, logPractice, completeCramSession }
