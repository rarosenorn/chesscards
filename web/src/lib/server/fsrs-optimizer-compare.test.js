// @vitest-environment node
import { describe, it, expect, vi } from "vitest"
import { createRequire } from "node:module"
import { default_w } from "ts-fsrs"

// the worker's part of a fit, run here with fsrs-rs, or with a training that
// comes out as the test says
const { fitReviews } = await import("./fsrs-optimizer.js");
const real = createRequire(import.meta.url)("@open-spaced-repetition/binding");
const training = { numEpochs: 8, batchSize: 512, seed: 2023, learningRate: 4e-2, maxSeqLen: 256, gamma: 1 };

const csvOf = cards => {
	let seed = 9;
	const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
	const lines = ["card_id,review_time,review_rating,review_state,review_duration"];
	for (let c = 0; c < cards; c++) {
		let at = Date.UTC(2026, 0, 1, 9) + (c % 60) * 864e5, interval = 1;
		lines.push(`c${c},${at},3,0,0`);
		for (let r = 0; r < 6; r++) {
			at += Math.round(interval) * 864e5;
			const rating = rnd() < 0.9 ? 3 : 1;
			lines.push(`c${c},${at},${rating},2,0`);
			interval = rating === 1 ? 1 : interval * 3;
		}
	}
	return new TextEncoder().encode(lines.join("\n"));
}
const run = (cards, inUse, fit = null, zone = "Europe/Sofia") => {
	const calls = [];
	const binding = { ...real, computeParameters: (items, options) => { calls.push({ ...options, items: items.length }); return fit ? Promise.resolve(fit) : real.computeParameters(items, options); } };
	return fitReviews(binding, { csv: csvOf(cards), rolloverHour: 4, timeZone: zone, offset: 120, inUse, model: "FSRS-6", training })
		.then(parameters => ({ parameters, calls }));
}
// first reviews read as a memory of 100 days: every early review predicted remembered
const absurd = default_w.map((w, i) => i < 4 ? 100 : w);

describe("a fit", () => {
	it("trains as Anki does: each review with its card, 8 epochs", async () => {
		const { calls } = await run(300, [...default_w]);
		expect(calls[0].items).toBeGreaterThan(0);
		expect(calls[0].cardIds).toHaveLength(calls[0].items);
		expect(calls[0].trainingConfig.numEpochs).toBe(8);
	})

	it("replaces the parameters in use only when it predicts the reviews better", async () => {
		// worse than the defaults in use before any fit: the defaults stay
		expect((await run(300, [...default_w], absurd)).parameters).toEqual(default_w);
		// a real fit beats the defaults
		const own = (await run(300, [...default_w])).parameters;
		expect(own).not.toEqual(default_w);
		// worse than the user's own earlier fit: that one stays
		expect((await run(300, own, absurd)).parameters).toEqual(own);
	})

	it("reads days at the given offset where fsrs-rs does not know the zone", async () => {
		expect((await run(300, [...default_w], null, "Not/AZone")).parameters).toHaveLength(21);
	})
})

describe("a fit with too few reviews to score", () => {
	it("keeps the parameters in use, quietly", async () => {
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});
		expect((await run(2, [...default_w])).parameters).toEqual(default_w);
		expect((await run(0, [...default_w])).parameters).toEqual(default_w);
		expect(logged).not.toHaveBeenCalled();
		logged.mockRestore();
	})
})
