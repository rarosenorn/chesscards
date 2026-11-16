import { computeParameters, convertCsvToFsrsItems } from "@open-spaced-repetition/binding"
import { pool } from "./pool.js"

// The FSRS model fitted to a user's own reviews, as Anki's Optimize button
// does it, one set of parameters for all their decks. fsrs-rs (the optimizer
// Anki runs) does the fitting and reads the history the way Anki does: each
// card from its last New review on, so a reset card starts over; study days
// cut at the user's rollover hour in their own zone; with too few reviews it
// gives back the defaults. FSRS-6, the model ts-fsrs 5 schedules with.
const MODEL = "FSRS-6";
const REFIT_DAYS = 14;

// users being fitted in this process, so a second visit doesn't start another
const fitting = new Set();

// the review logs FSRS scheduled: basic cards' (a tactic's has no state), with
// a card to belong to (logs from before ids were kept have none), graded
// Again..Easy; a deleted card's history counts too, as in Anki
const historyOf = async userId => {
	const { rows } = await pool.query(`
		select coalesce(card_id, marketplace_card_instance_id) as card, review, rating, state
		from review_logs
		where user_id = $1 and state is not null and rating between 1 and 4
			and coalesce(card_id, marketplace_card_instance_id) is not null
		order by card, review`, [userId]);
	return rows;
}

// in the columns of the FSRS benchmark's revlog, which fsrs-rs reads
const asCsv = rows => new TextEncoder().encode([
	"card_id,review_time,review_rating,review_state,review_duration",
	...rows.map(row => `${row.card},${new Date(row.review).getTime()},${row.rating},${row.state},0`)
].join("\n"));

const fit = async (userId, { rolloverHour, timeZone }) => {
	const rows = await historyOf(userId);
	const items = convertCsvToFsrsItems(asCsv(rows), rolloverHour, timeZone, MODEL);
	const parameters = await computeParameters(items, { enableShortTerm: true, numRelearningSteps: 1, modelVersion: MODEL });
	await pool.query(`
		insert into fsrs_parameters (user_id, parameters, reviews, optimized_at) values ($1, $2, $3, now())
		on conflict (user_id) do update set parameters = excluded.parameters, reviews = excluded.reviews, optimized_at = excluded.optimized_at`,
		[userId, parameters, rows.length]);
}

// The parameters study schedules this user's cards with: their own, or null
// for the defaults until the first fit. When they are missing or 14 days old
// a new fit starts in the background, for the next visit to use.
const parametersFor = async (userId, day) => {
	const { rows: [row] } = await pool.query(`
		select parameters, optimized_at < now() - make_interval(days => $2) as stale
		from fsrs_parameters where user_id = $1`, [userId, REFIT_DAYS]);
	if ((!row || row.stale) && !fitting.has(userId)) {
		fitting.add(userId);
		fit(userId, day)
			.catch(err => console.error("FSRS optimizer failed", err))
			.finally(() => fitting.delete(userId));
	}
	return row?.parameters ?? null;
}

export { parametersFor, fit, asCsv, REFIT_DAYS }
