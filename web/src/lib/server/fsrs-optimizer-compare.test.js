// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"
import { default_w } from "ts-fsrs"

// the fit as the test says it comes out, scored by the real fsrs-rs
const binding = vi.hoisted(() => ({ fit: null, calls: [] }));
vi.mock("@open-spaced-repetition/binding", async original => {
	const real = await original();
	return { ...real, computeParameters: vi.fn(async (items, options) => {
		binding.calls.push({ ...options, items: items.length });
		return binding.fit ?? real.computeParameters(items, options);
	}) };
});
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

const { fit } = await import("./fsrs-optimizer.js");
const day = { rolloverHour: 4, timeZone: "Europe/Sofia" };

const historyOf = cards => {
	let seed = 9;
	const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
	const rows = [];
	for (let c = 0; c < cards; c++) {
		let at = Date.UTC(2026, 0, 1, 9) + (c % 60) * 864e5, interval = 1;
		rows.push({ card: `c${c}`, review: new Date(at), rating: 3, state: 0 });
		for (let r = 0; r < 6; r++) {
			at += Math.round(interval) * 864e5;
			const rating = rnd() < 0.9 ? 3 : 1;
			rows.push({ card: `c${c}`, review: new Date(at), rating, state: 2 });
			interval = rating === 1 ? 1 : interval * 3;
		}
	}
	return rows;
}
// first reviews read as a memory of 100 days: every early review predicted remembered
const absurd = default_w.map((w, i) => i < 4 ? 100 : w);

beforeEach(() => { binding.fit = null; binding.calls = []; db.history = historyOf(300); db.stored = null; db.inserts = []; });

describe("a fit", () => {
	it("trains as Anki does: each review with its card, 8 epochs", async () => {
		await fit("u", day);
		expect(binding.calls[0].items).toBeGreaterThan(0);
		expect(binding.calls[0].cardIds).toHaveLength(binding.calls[0].items);
		expect(binding.calls[0].trainingConfig.numEpochs).toBe(8);
	})

	it("replaces the parameters in use only when it predicts the reviews better", async () => {
		// worse than the defaults in use before any fit: the defaults stay
		binding.fit = absurd;
		await fit("u", day);
		expect(db.inserts[0][1]).toEqual(default_w);

		// worse than the user's own earlier fit: that one stays
		binding.fit = null;
		await fit("u", day);
		const own = db.inserts[1][1];
		expect(own).not.toEqual(default_w);
		db.stored = { parameters: own };
		binding.fit = absurd;
		await fit("u", day);
		expect(db.inserts[2][1]).toEqual(own);
	})
})
