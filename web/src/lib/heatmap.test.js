import { describe, it, expect } from "vitest"
import { levelOf, heatmapMonths, sayDay, streaks } from "./heatmap.js"

// 2026-10-08 is a Thursday
const TODAY = "2026-10-08";

describe("the months shown", () => {
	const months = heatmapMonths([{ day: "2026-10-05", count: 10 }, { day: "2026-10-08", count: 30 }, { day: "2020-01-01", count: 999 }], TODAY, 3);

	it("are the last ones, this month last, each under its name and year", () => {
		expect(months.map(month => month.label)).toEqual(["Aug '26", "Sep '26", "Oct '26"]);
	})

	it("hold their own days only, in columns from Monday", () => {
		// August 2026 begins on a Saturday and has 31 days: six columns
		const [august] = months;
		expect(august.weeks.length).toBe(6);
		expect(august.weeks[0].map(cell => cell?.day ?? null)).toEqual([null, null, null, null, null, "2026-08-01", "2026-08-02"]);
		expect(august.weeks[5].map(cell => cell?.day ?? null)).toEqual(["2026-08-31", null, null, null, null, null, null]);
	})

	it("carry each day's count, shaded against the average of the active days shown, and mark today", () => {
		const october = months[2];
		expect(october.weeks[1][0]).toEqual({ day: "2026-10-05", count: 10, level: 1, today: false });
		expect(october.weeks[1][3]).toEqual({ day: TODAY, count: 30, level: 3, today: true });
		expect(october.weeks[0][3]).toEqual({ day: "2026-10-01", count: 0, level: 0, today: false });
	})

	it("show the rest of this month as days still to come", () => {
		const october = months[2];
		expect(october.weeks[1][4]).toEqual({ day: "2026-10-09", future: true });
		expect(october.weeks.at(-1).filter(Boolean).at(-1)).toEqual({ day: "2026-10-31", future: true });
	})

	it("run across a year's end", () => {
		expect(heatmapMonths([], "2026-02-10", 4).map(month => month.label)).toEqual(["Nov '25", "Dec '25", "Jan '26", "Feb '26"]);
	})
})

describe("how strongly a day is shaded", () => {
	it("runs from nothing to more than half again the usual", () => {
		expect([0, 5, 10, 20, 30, 31].map(count => levelOf(count, 20))).toEqual([0, 1, 1, 2, 3, 4]);
	})
})

describe("a day in words", () => {
	it("is day, month, year", () => {
		expect(sayDay("2026-10-08")).toBe("8 Oct 2026");
	})
})

describe("streaks", () => {
	const day = (date, count = 1) => ({ day: date, count });

	it("count the run still going, through yesterday when today is not studied yet", () => {
		expect(streaks([day("2026-10-05"), day("2026-10-06"), day("2026-10-07")], TODAY).current).toBe(3);
		expect(streaks([day("2026-10-06"), day("2026-10-07"), day(TODAY)], TODAY).current).toBe(3);
		expect(streaks([day("2026-10-05"), day("2026-10-06")], TODAY).current).toBe(0);
	})

	it("find the longest run there has been", () => {
		const counts = [day("2026-01-01"), day("2026-01-02"), day("2026-01-03"), day("2026-01-04"), day("2026-10-07"), day(TODAY)];
		expect(streaks(counts, TODAY)).toMatchObject({ current: 2, longest: 4 });
	})

	it("add up the year shown", () => {
		expect(streaks([day("2025-10-01", 50), day("2026-03-01", 7), day(TODAY, 3)], TODAY).total).toBe(10);
	})
})
