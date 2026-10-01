import { createEmptyCard } from "ts-fsrs"
import * as decks from "./decks.js"
import { analysePositions, isInstalled, BINARY } from "./stockfish.js"
import { explainMistake } from "./explain.js"
import { readGame, findMistakes, mistakeCardSpec, KINDS } from "../game-mistakes.js"
import { cardBuilder } from "../card-spec.js"

// A game becoming cards: the engine goes through it, the mistakes of the
// side asked about are picked out, each gets its reasons written, and the
// cards go into the deck.
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
const EXPLAIN_AT_ONCE = 3;
const KEEP_FINISHED = 10 * 60_000;

// on globalThis, so a dev-server reload of this module keeps the line
const state = globalThis.__gameImports ??= { jobs: new Map(), queue: [], running: false };

const run = async job => {
	job.phase = "analysing";
	const skip = job.game.finished ? [job.game.fens.length - 1] : [];
	const evals = await analysePositions(job.game.fens, {
		skip,
		onProgress: (done, total) => { job.done = done; job.total = total; }
	});
	const mistakes = findMistakes(job.game, evals, job.color, job.kinds);

	job.phase = "explaining";
	job.done = 0;
	job.total = mistakes.length;
	const reasons = new Array(mistakes.length);
	let next = 0;
	await Promise.all(Array.from({ length: Math.min(EXPLAIN_AT_ONCE, mistakes.length) }, async () => {
		while (next < mistakes.length) {
			const index = next++;
			reasons[index] = await explainMistake(job.game, mistakes[index]);
			job.done += 1;
		}
	}));

	job.phase = "saving";
	const problems = [];
	const { buildCard } = cardBuilder(problem => problems.push(problem));
	const cards = mistakes.map((mistake, i) => buildCard(mistakeCardSpec(job.game, mistake, reasons[i]), `move ${mistake.ply + 1}`));
	if (problems.length > 0) throw new Error(`The cards did not build: ${problems[0]}`);
	const cardIds = cards.length > 0
		? await decks.addCards(job.userId, job.deckId, job.stageId, cards, Object.values(createEmptyCard()))
		: [];
	job.result = {
		cardIds,
		counts: Object.fromEntries(KINDS.map(kind => [kind, mistakes.filter(m => m.kind === kind).length])),
		unexplained: reasons.filter(why => !why).length
	};
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
			console.error("game import:", error);
			job.phase = "failed";
			job.error = error.message;
		}
		// the game itself is the bulk of a job, and nothing asks for it again
		job.game = null;
		setTimeout(() => state.jobs.delete(job.id), KEEP_FINISHED).unref();
	}
	state.running = false;
}

const isActive = job => !["done", "failed"].includes(job.phase);

// Returns the job's id. Throws an Error whose message is for the user.
const start = async (userId, { deckId, stageId, pgn, color, kinds }) => {
	if (!isInstalled()) throw new Error(`Stockfish is not installed on the server (${BINARY})`);
	if (!await decks.userIdOwnsDeckId(userId, deckId)) throw new Error("Unauthorized");
	if (!["w", "b"].includes(color)) throw new Error("Which side did you play?");
	const wanted = KINDS.filter(kind => kinds?.includes(kind));
	if (wanted.length === 0) throw new Error("Nothing to look for: pick blunders, mistakes or inaccuracies");
	if (typeof pgn !== "string" || pgn.length > MAX_PGN) throw new Error("That is not a game");
	let game;
	try { game = readGame(pgn); } catch { throw new Error("The game could not be read"); }
	if (game.moves.length > MAX_PLIES) throw new Error("The game is too long to analyse");
	// one at a time each: the line is everyone's
	if ([...state.jobs.values()].some(job => job.userId === userId && isActive(job)))
		throw new Error("You already have a game being analysed");

	const job = {
		id: crypto.randomUUID(), userId, deckId, stageId: stageId || null, color, kinds: wanted, game,
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

export { start, status }
