import { importStatus, cancelImport } from "./import.remote.js"

// The import under way, or the last one: { jobId, url, deckId, phase, done,
// total, ahead, result, error }. It lives here and not in the page
// because the job runs on the server whether or not the page stays to watch:
// leaving for Cards must not stop the asking, or the cards would arrive in
// the database and never in the deck the tabs are showing.
export const current = $state({ job: null });

let timer = null;

const isActive = job => !!job && job.phase !== "done" && job.phase !== "failed";

// `deck` is the layout's shared deck object, which is reused from deck to
// deck — so it is only written when it is still the deck the job is for
const ask = async deck => {
	const job = current.job;
	try {
		const { deck: fresh, ...status } = await importStatus({ jobId: job.jobId, deckId: job.deckId });
		if (current.job !== job) return;
		// called off from another tab: there is nothing left to show
		current.job = status.phase === "cancelled" ? null : { ...job, ...status };
		if (fresh && deck.id === job.deckId) Object.assign(deck, fresh);
	} catch (err) {
		if (current.job !== job) return;
		// Gone for good; anything else is the network, and worth asking again.
		// One picked up after a reload and already forgotten by the server
		// most likely finished long ago — its cards came with the reload —
		// so it is dropped without a word.
		if (err?.status === 404) current.job = job.resumed ? null : { ...job, phase: "failed", error: err.body?.message ?? "The import is gone" };
	}
	if (isActive(current.job)) timer = setTimeout(() => ask(deck), 1000);
}

export const follow = (deck, jobId, url, resumed = false) => {
	clearTimeout(timer);
	current.job = { jobId, url, deckId: deck.id, resumed, phase: "queued", done: 0, total: 0, ahead: 0, result: null, error: null };
	ask(deck);
}

// A page opened afresh — a reload, a tab closed and opened again — knows of
// no job; `active` is what the server says is still under way for the user
// ({ jobId, deckId, url } or null), and it is followed again from here.
export const resume = (deck, active) => {
	if (isActive(current.job)) return;
	if (active?.deckId === deck.id) follow(deck, active.jobId, active.url, true);
}

// The import is called off, and forgotten here — unless it was already past
// stopping, in which case it is followed to its end like any other.
export const cancel = async () => {
	const job = current.job;
	if (!isActive(job)) return;
	let cancelled = true;
	// a job the server no longer knows is as good as stopped
	try { ({ cancelled } = await cancelImport({ jobId: job.jobId })); } catch { /* gone already */ }
	if (!cancelled || current.job !== job) return;
	clearTimeout(timer);
	current.job = null;
}

export { isActive }
