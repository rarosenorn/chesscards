import { createEmptyCard } from "ts-fsrs"
import * as decks from "./decks.js"
import { analysePositions, analyseMoves, isInstalled, BINARY } from "./stockfish.js"
import { explainMistake } from "./explain.js"
import { readGame, findMistakes, triesToCheck, withTries, mistakeCardSpec, KINDS } from "../game-mistakes.js"
import { cardBuilder } from "../card-spec.js"

// A game becoming cards: the engine goes through it, the mistakes of the
// side asked about are picked out, the engine refutes the tempting moves
// around each, each gets its reasons written, and the cards go into the deck.
//
// That is half a minute of every core the machine has, so it cannot be a
// request: it is a job. Jobs wait in one line and run one at a time, each
// with all the engines; the page that started one asks after it until it is
// done, and need not stay to see the cards arrive.
//
// The line lives in this process's memory. A restart forgets the jobs in it
// (their owners import again), and a second server process would have a line
// of its own — it wants a real queue the day the app runs as more than one.
const MAX_PLIES = 400;
const MAX_PGN = 100_000;
const KEEP_FINISHED = 10 * 60_000;

// on globalThis, so a dev-server reload of this module keeps the line
const state = globalThis.__gameImports ??= { jobs: new Map(), queue: [], running: false };

// A job its owner called off. It stops where it next looks up: between two
// searches of the engine, and at once while the reasons are being written.
class Cancelled extends Error {}
const check = job => { if (job.cancelled) throw new Cancelled(); }

const run = async job => {
	job.phase = "analysing";
	const skip = job.game.finished ? [job.game.fens.length - 1] : [];
	const evals = await analysePositions(job.game.fens, {
		skip,
		onProgress: (done, total) => { check(job); job.done = done; job.total = total; }
	});
	const found = findMistakes(job.game, evals, job.color, job.kinds);

	// The engine goes from one mistake to the next, refuting the tempting
	// moves around it, and each mistake's reasons are written as soon as its
	// tries are in, while the engine is on the ones after it: that is what
	// keeps the writing to a few at a time.
	job.phase = "explaining";
	job.done = 0;
	job.total = found.length;
	const mistakes = new Array(found.length);
	const reasons = new Array(found.length);
	const writing = [];
	for (const [index, mistake] of found.entries()) {
		check(job);
		const asks = triesToCheck(mistake);
		mistakes[index] = withTries(mistake, asks, await analyseMoves(asks, { onProgress: () => check(job) }));
		writing.push((async () => {
			// a missed mate is its own reason; the card writes it out itself
			reasons[index] = mistake.missedMate ? null : await explainMistake(job.game, mistakes[index]);
			job.done += 1;
		})());
	}
	// the writing is not waited out by a job called off: what is still being
	// written is left to finish on its own, and comes to nothing
	const calledOff = new Promise((_, reject) => { job.abort = () => reject(new Cancelled()); });
	calledOff.catch(() => {});
	await Promise.race([Promise.all(writing), calledOff]);
	check(job);

	// past this the cards are on their way in, and the job is not stopped
	job.phase = "saving";
	const problems = [];
	const { buildCard } = cardBuilder(problem => problems.push(problem));
	const cards = mistakes.map((mistake, i) => buildCard(mistakeCardSpec(job.game, mistake, reasons[i]), `move ${mistake.ply + 1}`));
	if (problems.length > 0) throw new Error(`The cards did not build: ${problems[0]}`);
	const cardIds = cards.length > 0
		? await decks.addCards(job.userId, job.deckId, cards, Object.values(createEmptyCard()))
		: [];
	job.result = { cardIds };
}

const work = async () => {
	if (state.running) return;
	state.running = true;
	while (state.queue.length > 0) {
		const job = state.queue.shift();
		try {
			await run(job);
			job.phase = "done";
		} catch (error) {
			if (error instanceof Cancelled) job.phase = "cancelled";
			else {
				console.error("game import:", error);
				job.phase = "failed";
				job.error = error.message;
			}
		}
		// the game itself is the bulk of a job, and nothing asks for it again
		job.game = null;
		setTimeout(() => state.jobs.delete(job.id), KEEP_FINISHED).unref();
	}
	state.running = false;
}

const isActive = job => !job.cancelled && !["done", "failed", "cancelled"].includes(job.phase);

// Returns the job's id. Throws an Error whose message is for the user.
// deckId: the deck of the user's own the cards go in.
const start = async (userId, { deckId, pgn, color, kinds, url }) => {
	if (!isInstalled()) throw new Error(`Stockfish is not installed on the server (${BINARY})`);
	const UUID = /^[0-9a-f-]{36}$/i;
	if (!UUID.test(deckId ?? "") || !await decks.userIdOwnsDeckId(userId, deckId)) throw new Error("Unauthorized");
	if (!["w", "b"].includes(color)) throw new Error("Which side did you play?");
	const wanted = KINDS.filter(kind => Array.isArray(kinds) && kinds.includes(kind));
	if (wanted.length === 0) throw new Error("Nothing to look for: pick blunders, mistakes or inaccuracies");
	if (typeof pgn !== "string" || pgn.length > MAX_PGN) throw new Error("That is not a game");
	let game;
	try { game = readGame(pgn); } catch { throw new Error("The game could not be read"); }
	if (game.moves.length > MAX_PLIES) throw new Error("The game is too long to analyse");
	// one at a time each: the line is everyone's
	if ([...state.jobs.values()].some(job => job.userId === userId && isActive(job)))
		throw new Error("You already have a game being analysed");

	const job = {
		id: crypto.randomUUID(), userId, deckId, color, kinds: wanted, game,
		// where the game came from, for the page to mark it in its list
		url: typeof url === "string" && url.length <= 300 ? url : null,
		phase: "queued", done: 0, total: 0, result: null, error: null
	};
	state.jobs.set(job.id, job);
	state.queue.push(job);
	work();
	return job.id;
}

// what the page shows; null for a job that is not this user's (or is gone)
const status = (userId, jobId) => {
	const job = state.jobs.get(jobId);
	if (!job || job.userId !== userId) return null;
	return {
		phase: job.phase, done: job.done, total: job.total,
		ahead: job.phase === "queued" ? state.queue.indexOf(job) + (state.running ? 1 : 0) : 0,
		result: job.result, error: job.error
	};
}

// Calls the user's job off: out of the line if it is still waiting, stopped
// if it is running. False when there is nothing to stop any more — it is
// done, or its cards are already going into the deck.
const cancel = (userId, jobId) => {
	const job = state.jobs.get(jobId);
	if (!job || job.userId !== userId || !isActive(job) || job.phase === "saving") return false;
	job.cancelled = true;
	const waiting = state.queue.indexOf(job);
	if (waiting >= 0) {
		state.queue.splice(waiting, 1);
		job.phase = "cancelled";
		job.game = null;
		state.jobs.delete(job.id);
	} else job.abort?.();
	return true;
}

// The user's job in the line, if there is one: a page opened afresh has no
// other way to know of it, and the job runs whether or not a page watches.
const active = userId => {
	const job = [...state.jobs.values()].find(job => job.userId === userId && isActive(job));
	return job ? { jobId: job.id, deckId: job.deckId, url: job.url } : null;
}

export { start, status, cancel, active }
