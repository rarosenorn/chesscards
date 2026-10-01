import { importStatus } from "./import.remote.js"

// The import under way, or the last one: { jobId, url, deckId, phase, done,
// total, ahead, result, error, undone }. It lives here and not in the page
// because the job runs on the server whether or not the page stays to watch:
// leaving for Cards must not stop the asking, or the cards would arrive in
// the database and never in the deck the tabs are showing.
export const current = $state({ job: null });

const KEY = "game-import";
let timer = null;

const isActive = job => !!job && job.phase !== "done" && job.phase !== "failed";

// a reload forgets this module; the tab's storage says what to pick up again
const remember = () => {
	try {
		const job = current.job;
		if (isActive(job)) sessionStorage.setItem(KEY, JSON.stringify({ jobId: job.jobId, url: job.url, deckId: job.deckId }));
		else sessionStorage.removeItem(KEY);
	} catch { /* storage is a convenience */ }
}

// `deck` is the layout's shared deck object, which is reused from deck to
// deck — so it is only written when it is still the deck the job is for
const ask = async deck => {
	const job = current.job;
	try {
		const { deck: fresh, ...status } = await importStatus({ jobId: job.jobId, deckId: job.deckId });
		if (current.job !== job) return;
		current.job = { ...job, ...status };
		if (fresh && deck.id === job.deckId) Object.assign(deck, fresh);
	} catch (err) {
		if (current.job !== job) return;
		// Gone for good; anything else is the network, and worth asking again.
		// One picked up after a reload and already forgotten by the server
		// most likely finished long ago — its cards came with the reload —
		// so it is dropped without a word.
		if (err?.status === 404) current.job = job.resumed ? null : { ...job, phase: "failed", error: err.body?.message ?? "The import is gone" };
	}
	remember();
	if (isActive(current.job)) timer = setTimeout(() => ask(deck), 1000);
}

export const follow = (deck, jobId, url, resumed = false) => {
	clearTimeout(timer);
	current.job = { jobId, url, deckId: deck.id, resumed, phase: "queued", done: 0, total: 0, ahead: 0, result: null, error: null };
	remember();
	ask(deck);
}

export const resume = deck => {
	if (isActive(current.job)) return;
	try {
		const stored = JSON.parse(sessionStorage.getItem(KEY));
		if (stored?.deckId === deck.id) follow(deck, stored.jobId, stored.url, true);
	} catch { /* nothing to pick up */ }
}

export { isActive }
