// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest"

// the real worker threads, counted
const threads = vi.hoisted(() => ({ spawned: 0, running: 0, most: 0 }));
vi.mock("node:worker_threads", async original => {
	const real = await original();
	class Counted extends real.Worker {
		constructor(...args) {
			super(...args);
			threads.spawned++;
			threads.most = Math.max(threads.most, ++threads.running);
			this.once("exit", () => threads.running--);
		}
	}
	return { ...real, Worker: Counted };
});
const db = vi.hoisted(() => ({ csv: "", reviews: 0, inserts: [] }));
vi.mock("./pool.js", () => ({
	pool: {
		query: vi.fn(async (sql, params) => {
			if (sql.includes("from review_logs")) return { rows: [{ reviews: db.reviews, csv: db.csv }] };
			if (sql.includes("insert into fsrs_parameters")) { db.inserts.push(params); return { rows: [] }; }
			if (sql.includes("from fsrs_parameters")) return { rows: [] };
			throw new Error(`unexpected query: ${sql}`);
		})
	}
}));

const { fit, inWorker } = await import("./fsrs-optimizer.js");
const { default_w } = await import("ts-fsrs");
const day = { rolloverHour: 4, timeZone: "UTC" };

const reviewsOf = cards => {
	const lines = [];
	for (let c = 0; c < cards; c++) {
		let at = Date.UTC(2026, 0, 1, 9) + (c % 60) * 864e5;
		lines.push(`c${c},${at},3,0,0`);
		for (let r = 1; r <= 5; r++) lines.push(`c${c},${at += r * 2 * 864e5},${r % 4 ? 3 : 1},2,0`);
	}
	return { csv: lines.join("\n"), reviews: lines.length };
}

beforeEach(() => { Object.assign(threads, { spawned: 0, running: 0, most: 0 }); Object.assign(db, { csv: "", reviews: 0, inserts: [] }); });

describe("the fit's worker thread", () => {
	it("is not started for a user with no reviews to fit", async () => {
		await fit("new", day);
		expect(threads.spawned).toBe(0);
		expect(db.inserts[0]).toEqual(["new", default_w, 0]);
	})

	it("runs a few fits at a time, however many users ask at once", async () => {
		Object.assign(db, reviewsOf(200));
		await Promise.all(["a", "b", "c", "d", "e"].map(user => fit(user, day)));
		expect(threads.spawned).toBe(5);
		expect(threads.most).toBeLessThanOrEqual(2);
	})

	it("is stopped, and the fit failed, when it does not finish in time", async () => {
		const hanging = "setInterval(() => {}, 1000);";
		await expect(inWorker({ csv: new Uint8Array(1) }, { source: hanging, timeout: 200 })).rejects.toThrow(/did not finish/);
		await vi.waitFor(() => expect(threads.running).toBe(0));
	})
})
