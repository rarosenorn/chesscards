// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"

const db = vi.hoisted(() => ({ history: [], stored: null, inserts: [] }));
vi.mock("./pool.js", () => ({
	pool: {
		query: vi.fn(async (sql, params) => {
			if (sql.includes("from review_logs")) return { rows: db.history };
			if (sql.includes("insert into fsrs_parameters")) { db.inserts.push(params); return { rows: [] }; }
			if (sql.includes("from fsrs_parameters")) return { rows: db.stored ? [db.stored] : [] };
			throw new Error(`unexpected query: ${sql}`);
		})
	}
}));

const { parametersFor, fit, refit, lastFit, asCsv } = await import("./fsrs-optimizer.js");
const { default_w } = await import("ts-fsrs");

const day = { rolloverHour: 4, timeZone: "Europe/Sofia" };
const DAY = 864e5;

// cards learnt on a schedule close to what FSRS would give, mostly recalled
const historyOf = cards => {
	let seed = 3;
	const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
	const rows = [];
	for (let c = 0; c < cards; c++) {
		let at = Date.UTC(2026, 0, 1, 9) + (c % 60) * DAY, interval = 1;
		rows.push({ card: `c${c}`, review: new Date(at), rating: 3, state: 0 });
		at += 10 * 60e3;
		rows.push({ card: `c${c}`, review: new Date(at), rating: 3, state: 1 });
		for (let r = 0; r < 6; r++) {
			at += Math.round(interval) * DAY;
			const rating = rnd() < 0.9 ? 3 : 1;
			rows.push({ card: `c${c}`, review: new Date(at), rating, state: 2 });
			interval = rating === 1 ? 1 : interval * 3;
		}
	}
	return rows;
}

const settled = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => { db.history = []; db.stored = null; db.inserts = []; });

describe("the FSRS optimizer", () => {
	it("writes the review logs in the revlog columns fsrs-rs reads", () => {
		const csv = new TextDecoder().decode(asCsv([{ card: "a", review: new Date(Date.UTC(2026, 0, 1)), rating: 3, state: 0 }]));
		expect(csv).toBe(`card_id,review_time,review_rating,review_state,review_duration\na,${Date.UTC(2026, 0, 1)},3,0,0`);
	})

	it("fits the user's own parameters from their reviews, and keeps the defaults with too few", async () => {
		db.history = historyOf(300);
		await fit("u", day);
		const [userId, fitted, reviews] = db.inserts[0];
		expect(userId).toBe("u");
		expect(fitted).toHaveLength(21);
		expect(reviews).toBe(db.history.length);

		db.history = historyOf(2);
		await fit("u", day);
		const defaults = db.inserts[1][1];
		expect(defaults[0]).toBeCloseTo(0.212, 3);
		expect(fitted).not.toEqual(defaults);
	})

	it("starts a fit when there is none yet, studying on the defaults until it lands", async () => {
		db.history = historyOf(300);
		const { parameters, refitted } = await parametersFor("first", day);
		expect(parameters).toBe(null);
		const fitted = await refitted;
		expect(fitted).toHaveLength(21);
		expect(db.inserts[0]).toEqual(["first", fitted, db.history.length]);
	})

	it("uses a fit under 14 days old as it is, and refits an older one once however often study opens", async () => {
		db.stored = { parameters: [1, 2, 3], stale: false };
		expect(await parametersFor("u", day)).toEqual({ parameters: [1, 2, 3], refitted: null });
		await settled();
		expect(db.inserts).toHaveLength(0);

		db.stored = { parameters: [1, 2, 3], stale: true };
		db.history = historyOf(300);
		const first = await parametersFor("u", day);
		const second = await parametersFor("u", day);
		expect(first.parameters).toEqual([1, 2, 3]);
		const fitted = await first.refitted;
		expect(await second.refitted).toBe(fitted);
		await settled();
		expect(db.inserts).toHaveLength(1);
	})

	it("refits at once when asked, joining a fit already under way", async () => {
		db.history = historyOf(300);
		const [a, b] = [refit("u", day), refit("u", day)];
		expect(a).toBe(b);
		expect((await a).reviews).toBe(db.history.length);
		expect(db.inserts).toHaveLength(1);
	})

	it("tells Settings when the last fit was, from how many reviews, and whether it kept the defaults", async () => {
		expect(await lastFit("u")).toBe(null);
		const at = new Date();
		db.stored = { parameters: [...default_w], reviews: 40, optimized_at: at };
		expect(await lastFit("u")).toEqual({ reviews: 40, optimizedAt: at, defaults: true });
		db.stored = { parameters: default_w.map((w, i) => i === 0 ? w + 0.5 : w), reviews: 900, optimized_at: at };
		expect((await lastFit("u")).defaults).toBe(false);
	})
})
