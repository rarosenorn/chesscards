import { describe, it, expect } from "vitest"
import { crossesDay, isDueAt, isDueSoonAt, availableAt } from "./rollover.js"

// local times, so the 4am boundary is where the machine's clock puts it
const at = (day, hour, minute = 0) => new Date(2026, 10, day, hour, minute).getTime();
const card = (reviewed, due) => ({ last_review: new Date(reviewed).toISOString(), due: new Date(due).toISOString() });

describe("a learning step past the next rollover", () => {
	const step = card(at(16, 20), at(17, 19, 57));

	it("is a day card, as in Anki", () => {
		expect(crossesDay(step, 4)).toBe(true);
	});

	it("is waiting from the start of the day it falls in, not its exact time", () => {
		expect(availableAt(step, 4)).toBe(at(17, 4));
		expect(isDueAt(step, at(17, 4, 1), 4)).toBe(true);
		expect(isDueAt(step, at(17, 3, 59), 4)).toBe(false);
	});

	it("is never reached for by learn-ahead, which would hand over tomorrow", () => {
		const late = card(at(17, 3, 30), at(17, 4, 10));
		expect(isDueSoonAt(late, at(17, 3, 55), 4)).toBe(false);
		expect(isDueAt(late, at(17, 3, 59), 4)).toBe(false);
		expect(isDueAt(late, at(17, 4), 4)).toBe(true);
	});

	it("follows the user's hour", () => {
		const evening = card(at(16, 20), at(17, 5));
		expect(crossesDay(evening, 4)).toBe(true);
		expect(availableAt(evening, 4)).toBe(at(17, 4));
		expect(crossesDay(evening, 6)).toBe(false);
		expect(isDueAt(evening, at(17, 4, 30), 6)).toBe(false);
		expect(isDueAt(evening, at(17, 5), 6)).toBe(true);
	});
});

describe("a learning step within its day", () => {
	it("keeps its exact time, and learn-ahead reaches for it", () => {
		const step = card(at(16, 20), at(16, 20, 10));
		expect(crossesDay(step, 4)).toBe(false);
		expect(availableAt(step, 4)).toBe(at(16, 20, 10));
		expect(isDueAt(step, at(16, 20, 5), 4)).toBe(false);
		expect(isDueSoonAt(step, at(16, 20, 5), 4)).toBe(true);
	});

	it("in the small hours, belongs to the day that began yesterday", () => {
		const step = card(at(17, 1), at(17, 3));
		expect(crossesDay(step, 4)).toBe(false);
		expect(isDueAt(step, at(17, 3), 4)).toBe(true);
	});
});

describe("an interval of a day or more", () => {
	it("is a day card, waiting from the start of its day", () => {
		const review = card(at(16, 22), at(17, 22));
		expect(crossesDay(review, 4)).toBe(true);
		expect(availableAt(review, 4)).toBe(at(17, 4));
	});
});
