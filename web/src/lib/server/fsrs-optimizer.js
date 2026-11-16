import { Worker } from "node:worker_threads"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
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
// Settings' button refits at most this often, counted from the last fit
const MANUAL_GAP_MINUTES = 60;
// Anki's training (rslib's fsrs/params.rs): 8 epochs where fsrs-rs's FSRS-6
// default is 5, the rest fsrs-rs's own defaults
const TRAINING = { numEpochs: 8, batchSize: 512, seed: 2023, learningRate: 4e-2, maxSeqLen: 256, gamma: 1 };

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

// The fit itself, which takes CPU in proportion to the reviews, so it runs
// in a worker thread rather than holding up every other request. It is sent
// there as source, so it stands alone: fsrs-rs comes in as `binding`.
// - the reviews become fsrs-rs's items, each with its card (training takes a
//   card's reviews together, as Anki's does), days cut in the user's zone, or
//   at today's offset for a zone fsrs-rs's own database lacks
// - trained as Anki trains them
// - as Anki, the fit replaces the parameters in use (the FSRS-6 defaults
//   before the first) only if it predicts the reviews better, by log loss:
//   training is a search that can stop short of where it started. Too few
//   reviews to score by, and nothing changes. A model is told by its
//   parameter count, so the defaults are given, not left out.
function fitReviews(binding, { csv, rolloverHour, timeZone, offset, inUse, model, training }) {
	const convert = zone => binding.convertCsvToFsrsItemsWithCardIds(csv, rolloverHour, zone, model);
	let converted;
	try { converted = convert(timeZone); }
	catch (err) {
		if (!/Unsupported timezone/.test(err.message)) throw err;
		converted = convert(offset);
	}
	const { items, cardIds } = converted;
	return binding.computeParameters(items, {
		enableShortTerm: true, numRelearningSteps: 1, modelVersion: model, cardIds, trainingConfig: training, timeout: 50
	}).then(fitted => {
		const logLoss = parameters => new binding.FSRSBinding(parameters).evaluate(items).logLoss;
		try { return logLoss(inUse) <= logLoss(fitted) ? inUse : fitted; }
		catch (err) {
			if (items.length === 0 || /NotEnoughData/.test(err.message)) return inUse;
			console.error("FSRS parameters in use could not be scored; taking the new fit", err);
			return fitted;
		}
	});
}

const BINDING_URL = pathToFileURL(createRequire(import.meta.url).resolve("@open-spaced-repetition/binding")).href;
const WORKER_SOURCE = `(async () => {
	const { parentPort, workerData } = await import("node:worker_threads");
	const loaded = await import(workerData.bindingUrl);
	const fitReviews = ${fitReviews.toString()};
	fitReviews(loaded.default ?? loaded, workerData).then(
		parameters => parentPort.postMessage({ parameters }),
		err => parentPort.postMessage({ error: String(err?.stack ?? err) }));
})();`;

// a fit in its own worker thread, the review CSV handed over rather than copied
const inWorker = data => new Promise((resolve, reject) => {
	const worker = new Worker(WORKER_SOURCE, { eval: true, workerData: { ...data, bindingUrl: BINDING_URL }, transferList: [data.csv.buffer] });
	worker.once("message", ({ parameters, error }) => error ? reject(new Error(error)) : resolve(parameters));
	worker.once("error", reject);
	worker.once("exit", code => reject(new Error(`FSRS worker exited (${code}) without a result`)));
});

// The review logs FSRS scheduled, as the CSV of the FSRS benchmark's revlog
// that fsrs-rs reads, built by Postgres so this thread never holds them row by
// row: basic cards' (a tactic's has no state), with a card to belong to (logs
// from before ids were kept have none), graded Again..Easy; a deleted card's
// history counts too, as in Anki.
const historyOf = async userId => {
	const { rows: [row] } = await pool.query(`
		select count(*)::int as reviews, coalesce(string_agg(
			concat_ws(',', coalesce(card_id, marketplace_card_instance_id), (extract(epoch from review) * 1000)::bigint, rating, state, 0),
			E'\\n' order by coalesce(card_id, marketplace_card_instance_id), review), '') as csv
		from review_logs
		where user_id = $1 and state is not null and rating between 1 and 4
			and coalesce(card_id, marketplace_card_instance_id) is not null`, [userId]);
	return { reviews: row.reviews, csv: `card_id,review_time,review_rating,review_state,review_duration\n${row.csv}` };
}

const fit = async (userId, day) => {
	const [{ reviews, csv }, { rows: [stored] }] = await Promise.all([
		historyOf(userId),
		pool.query("select parameters from fsrs_parameters where user_id = $1", [userId])
	]);
	const parameters = await inWorker({
		csv: new TextEncoder().encode(csv), rolloverHour: day.rolloverHour, timeZone: day.timeZone, offset: offsetOf(day.timeZone),
		inUse: [...(stored?.parameters ?? default_w)], model: MODEL, training: TRAINING
	});
	await pool.query(`
		insert into fsrs_parameters (user_id, parameters, reviews, optimized_at) values ($1, $2, $3, now())
		on conflict (user_id) do update set parameters = excluded.parameters, reviews = excluded.reviews, optimized_at = excluded.optimized_at`,
		[userId, parameters, reviews]);
	return { parameters, reviews };
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

// Settings' Optimize parameters: a refit now, unless the last one was under
// an hour ago; then the minutes left to wait
const optimizeNow = async (userId, day) => {
	const { rows: [row] } = await pool.query(`
		select ceil(extract(epoch from optimized_at + make_interval(mins => $2) - now()) / 60)::int as wait
		from fsrs_parameters where user_id = $1`, [userId, MANUAL_GAP_MINUTES]);
	if (row?.wait > 0) return { wait: row.wait };
	return { fitted: await refit(userId, day) };
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

// the defaults: what fsrs-rs gives back with too few reviews to fit, and what
// stays when no fit has predicted the reviews better
const isDefault = parameters =>
	parameters.length === default_w.length && parameters.every((w, i) => Math.abs(w - default_w[i]) < 1e-4);

// the last fit, for Settings: when, from how many reviews, and whether the
// defaults are still in use; null before the first
const lastFit = async userId => {
	const { rows: [row] } = await pool.query(
		"select parameters, reviews, optimized_at from fsrs_parameters where user_id = $1", [userId]);
	return row ? { reviews: row.reviews, optimizedAt: row.optimized_at, defaults: isDefault(row.parameters) } : null;
}

export { parametersFor, refit, optimizeNow, fit, fitReviews, lastFit, dayOf, REFIT_DAYS }
