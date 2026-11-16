import { computeParameters, convertCsvToFsrsItems } from "@open-spaced-repetition/binding"
import { default_w } from "ts-fsrs"
import { pool } from "./pool.js"
import { DEFAULT_ROLLOVER_HOUR, TZ_COOKIE } from "$lib/rollover.js"

// The FSRS model fitted to a user's own reviews, as Anki's Optimize button
// does it, one set of parameters for all their decks. fsrs-rs (the optimizer
// Anki runs) does the fitting and reads the history the way Anki does: each
// card from its last New review on, so a reset card starts over; study days
// cut at the user's rollover hour in their own zone; with too few reviews it
// gives back the defaults. FSRS-6, the model ts-fsrs 5 schedules with.
const MODEL = "FSRS-6";
const REFIT_DAYS = 14;

// the fits under way in this process, by user, so a second ask waits on the
// same one rather than starting another
const fitting = new Map();

const knownZone = zone => {
	try { return Boolean(zone) && Boolean(new Intl.DateTimeFormat("en", { timeZone: zone })); }
	catch { return false; }
}

// the user's study day, as a request tells it: their rollover hour, in the
// zone their browser left in a cookie (the server's, for one no one knows)
const dayOf = ({ locals, cookies }) => {
	const zone = cookies.get(TZ_COOKIE);
	return {
		rolloverHour: locals.user?.rolloverHour ?? DEFAULT_ROLLOVER_HOUR,
		timeZone: knownZone(zone) ? zone : Intl.DateTimeFormat().resolvedOptions().timeZone
	};
}

// a zone's offset from UTC today, in minutes; 0 for one Intl does not know
const offsetOf = zone => {
	if (!knownZone(zone)) return 0;
	const name = new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "longOffset" })
		.formatToParts(new Date()).find(part => part.type === "timeZoneName").value;
	const [, sign, hours, minutes] = name.match(/([+-])(\d+):?(\d*)/) ?? [];
	return sign ? (sign === "-" ? -1 : 1) * (Number(hours) * 60 + Number(minutes || 0)) : 0;
}

// the reviews as fsrs-rs's items, its days cut in the user's zone; a zone its
// own database lacks is read at today's offset rather than not at all
const itemsOf = (rows, { rolloverHour, timeZone }) => {
	const csv = asCsv(rows);
	try { return convertCsvToFsrsItems(csv, rolloverHour, timeZone, MODEL); }
	catch (err) {
		if (!/Unsupported timezone/.test(err.message)) throw err;
		return convertCsvToFsrsItems(csv, rolloverHour, offsetOf(timeZone), MODEL);
	}
}

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

const fit = async (userId, day) => {
	const rows = await historyOf(userId);
	const items = itemsOf(rows, day);
	const parameters = await computeParameters(items, { enableShortTerm: true, numRelearningSteps: 1, modelVersion: MODEL, timeout: 50 });
	await pool.query(`
		insert into fsrs_parameters (user_id, parameters, reviews, optimized_at) values ($1, $2, $3, now())
		on conflict (user_id) do update set parameters = excluded.parameters, reviews = excluded.reviews, optimized_at = excluded.optimized_at`,
		[userId, parameters, rows.length]);
	return { parameters, reviews: rows.length };
}

// a fit for the user, or the one under way: what it found, or null if it failed
const refit = (userId, day) => {
	if (!fitting.has(userId)) {
		fitting.set(userId, fit(userId, day)
			.catch(err => { console.error("FSRS optimizer failed", err); return null; })
			.finally(() => fitting.delete(userId)));
	}
	return fitting.get(userId);
}

// The parameters study schedules this user's cards with: their own, or null
// for the defaults until the first fit. When they are missing or 14 days old
// a refit starts, and `refitted` is it: the new parameters once it is done
// (null if it failed), for study to switch to without waiting for it.
const parametersFor = async (userId, day) => {
	const { rows: [row] } = await pool.query(`
		select parameters, optimized_at < now() - make_interval(days => $2) as stale
		from fsrs_parameters where user_id = $1`, [userId, REFIT_DAYS]);
	const under = !row || row.stale ? refit(userId, day) : fitting.get(userId);
	return { parameters: row?.parameters ?? null, refitted: under?.then(found => found?.parameters ?? null) ?? null };
}

// the defaults, as fsrs-rs gives them back with too few reviews to fit
const isDefault = parameters =>
	parameters.length === default_w.length && parameters.every((w, i) => Math.abs(w - default_w[i]) < 1e-4);

// the last fit, for Settings: when, from how many reviews, and whether they
// were too few to move off the defaults; null before the first
const lastFit = async userId => {
	const { rows: [row] } = await pool.query(
		"select parameters, reviews, optimized_at from fsrs_parameters where user_id = $1", [userId]);
	return row ? { reviews: row.reviews, optimizedAt: row.optimized_at, defaults: isDefault(row.parameters) } : null;
}

export { parametersFor, refit, fit, lastFit, dayOf, asCsv, REFIT_DAYS }
