import { isDueAt } from "./rollover.js"
import { isSeen } from "./subdecks.js"

// A cram session goes through every card of what is being studied, due or
// not, once, in an order chosen at its start. A card answered Again, or one
// still on its learning steps, comes back when its wait is over, or sooner
// when nothing else is left. The session is plain data, so it can be kept
// where it outlives a change of tab:
// { order, counts, queue, waiting, currentId, total }, queue the ids not yet
// shown, waiting the ids that come back mapped to when (ms), currentId the
// card on screen, total how many cards it set out with.

// in order: as the deck reads. shuffled: at random. due: soonest due first.
const ORDERS = ["in-order", "shuffled", "due"];

// how long a card answered Again as practice stays away: a new card's first
// learning step, which is what Again costs in ordinary study
const PRACTICE_AGAIN_MS = 60_000;

// The session's cards in the order it takes them. `cards` come in reading
// order, which "in-order" keeps and the others fall back on between equals.
const cramOrder = (cards, order, random = Math.random) => {
	if (order === "shuffled") {
		const ids = cards.map(card => card.id);
		for (let i = ids.length - 1; i > 0; i--) {
			const j = Math.floor(random() * (i + 1));
			[ids[i], ids[j]] = [ids[j], ids[i]];
		}
		return ids;
	}
	if (order === "due") {
		// what has no due date to speak of follows the cards that do: those
		// never studied, then the tactics finished for good
		const rank = card => card.finished_at ? 2 : isSeen(card) ? 0 : 1;
		return cards
			.map((card, index) => ({ card, index, rank: rank(card) }))
			.sort((a, b) => a.rank - b.rank
				|| (a.rank === 0 ? Date.parse(a.card.due) - Date.parse(b.card.due) : 0)
				|| a.index - b.index)
			.map(entry => entry.card.id);
	}
	return cards.map(card => card.id);
}

const startCram = (cards, { order, counts }, random = Math.random) => ({
	order, counts,
	queue: cramOrder(cards, order, random),
	waiting: {},
	currentId: null,
	total: cards.length
});

// Whether an answer to the card is a review like any other, saved and
// scheduled from, when the session counts its answers: a new card and one on
// its (re)learning steps always, as ordinary study reaches for those; a card
// on a real schedule only once it is due. A tactic counts while it is due
// and not finished. Any other answer is practice and leaves the card as it
// was.
const answerCounts = (card, now, rolloverHour) =>
	card.card_type === "tactic"
		? !card.finished_at && isDueAt(card, now, rolloverHour)
		: card.state !== 2 || isDueAt(card, now, rolloverHour);

// When a card just graded for real comes back within the session: at its
// next step, while it is on its (re)learning steps. Graduated, or put on a
// real schedule, it is done with here (null).
const backAt = card =>
	card.card_type !== "tactic" && (card.state === 1 || card.state === 3) ? Date.parse(card.due) : null;

// The card that comes next, taken out of where it waited and put on screen:
// a card whose wait is over (the longest over first), else the next not yet
// shown, else the waiting card nearest its time. None, and the session is
// done.
const takeNext = (session, now) => {
	const [back] = Object.entries(session.waiting).sort((a, b) => a[1] - b[1]);
	let id = null;
	if (back && (back[1] <= now || session.queue.length === 0)) {
		id = back[0];
		delete session.waiting[id];
	} else if (session.queue.length) {
		id = session.queue.shift();
	}
	session.currentId = id;
	return id;
}

// the card on screen has been answered: it comes back at `at`, or with none
// is done with
const settle = (session, at = null) => {
	if (session.currentId != null && at != null) session.waiting[session.currentId] = at;
	session.currentId = null;
}

// a card that is no more (deleted mid-session) leaves the session too
const forget = (session, id) => {
	const before = cardsLeft(session);
	session.queue = session.queue.filter(queued => queued !== id);
	delete session.waiting[id];
	if (session.currentId === id) session.currentId = null;
	session.total -= before - cardsLeft(session);
}

// how many cards are still to be got right, the one on screen among them
const cardsLeft = session =>
	session.queue.length + Object.keys(session.waiting).length + (session.currentId != null ? 1 : 0);

export { ORDERS, PRACTICE_AGAIN_MS, cramOrder, startCram, answerCounts, backAt, takeNext, settle, forget, cardsLeft }
