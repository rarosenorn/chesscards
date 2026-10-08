import { pool } from "./pool.js"

// What a user has done day by day, for the activity heatmap: every answer
// saved as a review (review_logs) and every answer given as practice in a
// cram session (practice_logs).

// The study day an instant falls in, as text: in the user's zone, the day
// turning at their rollover hour (as BOUNDS in decks.js reads "today").
const studyDay = (at, zone, hour) =>
	`to_char(date_trunc('day', (${at} at time zone ${zone}) - make_interval(hours => ${hour})), 'YYYY-MM-DD')`;

// Every day the user answered anything, oldest first, each { day, count },
// and the study day it is now.
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

	return { days, today };
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

export { getDailyCounts, logPractice }
