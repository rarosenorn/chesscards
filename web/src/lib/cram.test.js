import { describe, it, expect } from "vitest"
import { cramOrder, startCram, answerCounts, backAt, takeNext, settle, forget, cardsLeft } from "./cram.js"

const NOW = Date.parse("2026-10-08T12:00:00Z");
const at = minutes => new Date(NOW + minutes * 60_000).toISOString();
const DAY = 24 * 60;
// a card on a real schedule, due `minutes` from now after an interval of ten days
const review = (id, minutes) => ({ id, state: 2, due: at(minutes), last_review: at(minutes - 10 * DAY) });
const fresh = id => ({ id, state: 0, due: at(-5 * DAY), last_review: null });
const learning = (id, minutes) => ({ id, state: 1, due: at(minutes), last_review: at(minutes - 10) });

describe("the order a cram session takes its cards in", () => {
	const cards = [review("late", 3 * DAY), fresh("new"), review("overdue", -2 * DAY), learning("step", 4),
		{ id: "solved", card_type: "tactic", state: null, due: at(-DAY), last_review: at(-DAY), finished_at: at(-DAY) }];

	it("is the reading order when in order", () => {
		expect(cramOrder(cards, "in-order")).toEqual(["late", "new", "overdue", "step", "solved"]);
	})

	it("by due date puts the soonest due first, then the never studied, then the finished", () => {
		expect(cramOrder(cards, "due")).toEqual(["overdue", "step", "late", "new", "solved"]);
	})

	it("shuffled holds every card once", () => {
		const ids = cramOrder(cards, "shuffled", () => 0.3);
		expect([...ids].sort()).toEqual(["late", "new", "overdue", "solved", "step"]);
		expect(ids).not.toEqual(["late", "new", "overdue", "step", "solved"]);
	})
})

describe("whether an answer counts", () => {
	it("always for a new card and one on its learning steps", () => {
		expect(answerCounts(fresh("a"), NOW, 4)).toBe(true);
		expect(answerCounts(learning("b", 8), NOW, 4)).toBe(true);
		expect(answerCounts({ ...learning("c", 8), state: 3 }, NOW, 4)).toBe(true);
	})

	it("for a card on a real schedule only once it is due", () => {
		expect(answerCounts(review("a", -DAY), NOW, 4)).toBe(true);
		expect(answerCounts(review("b", 3 * DAY), NOW, 4)).toBe(false);
	})

	it("for a tactic while it is due and not finished", () => {
		const tactic = { id: "t", card_type: "tactic", state: null, due: at(-60), last_review: null, finished_at: null };
		expect(answerCounts(tactic, NOW, 4)).toBe(true);
		expect(answerCounts({ ...tactic, due: at(5 * DAY), last_review: at(-DAY) }, NOW, 4)).toBe(false);
		expect(answerCounts({ ...tactic, finished_at: at(-DAY) }, NOW, 4)).toBe(false);
	})
})

describe("a cram session", () => {
	const cards = [fresh("a"), fresh("b"), fresh("c")];
	const start = () => startCram(cards, { order: "in-order", counts: true });

	it("shows each card once, in order, and is then done", () => {
		const session = start();
		const shown = [];
		for (let id; (id = takeNext(session, NOW)) != null;) { shown.push(id); settle(session); }
		expect(shown).toEqual(["a", "b", "c"]);
		expect(cardsLeft(session)).toBe(0);
	})

	it("brings a card back once its wait is over, before the cards not yet shown", () => {
		const session = start();
		takeNext(session, NOW);
		settle(session, NOW + 60_000);
		expect(takeNext(session, NOW + 1_000)).toBe("b");
		settle(session);
		expect(takeNext(session, NOW + 61_000)).toBe("a");
		settle(session);
		expect(takeNext(session, NOW + 62_000)).toBe("c");
	})

	it("brings it back sooner when nothing else is left", () => {
		const session = startCram([fresh("a")], { order: "in-order", counts: false });
		takeNext(session, NOW);
		settle(session, NOW + 60_000);
		expect(cardsLeft(session)).toBe(1);
		expect(takeNext(session, NOW + 1_000)).toBe("a");
		settle(session);
		expect(takeNext(session, NOW + 2_000)).toBe(null);
	})

	it("takes the card waiting longest first", () => {
		const session = start();
		takeNext(session, NOW); settle(session, NOW + 600_000);
		takeNext(session, NOW); settle(session, NOW + 60_000);
		takeNext(session, NOW); settle(session);
		expect(takeNext(session, NOW)).toBe("b");
	})

	it("drops a card that is deleted", () => {
		const session = start();
		takeNext(session, NOW);
		forget(session, "a");
		forget(session, "c");
		expect(session.total).toBe(1);
		expect(takeNext(session, NOW)).toBe("b");
	})
})

describe("when a card graded for real comes back", () => {
	it("is its next step while it is learning or relearning", () => {
		expect(backAt(learning("a", 10))).toBe(NOW + 600_000);
		expect(backAt({ ...learning("a", 10), state: 3 })).toBe(NOW + 600_000);
	})

	it("is never, once it is on a real schedule or a tactic", () => {
		expect(backAt(review("a", 3 * DAY))).toBe(null);
		expect(backAt({ id: "t", card_type: "tactic", state: null, due: at(DAY) })).toBe(null);
	})
})
