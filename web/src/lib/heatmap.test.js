import { describe, it, expect } from "vitest"
import { levelOf, heatmapWeeks, monthLabels, sayDay, streaks } from "./heatmap.js"

// 2026-10-08 is a Thursday
const TODAY = "2026-10-08";

describe("the weeks shown", () => {
	const weeks = heatmapWeeks([{ day: "2026-10-05", count: 10 }, { day: "2026-10-08", count: 30 }, { day: "2020-01-01", count: 999 }], TODAY, 3);

	it("are columns of seven days from Monday, ending with this week", () => {
		expect(weeks.length).toBe(3);
		expect(weeks[0][0].day).toBe("2026-09-21");
		expect(weeks[2][0].day).toBe("2026-10-05");
		expect(weeks[2][3].day).toBe(TODAY);
	})

	it("leave out the days still to come", () => {
		expect(weeks[2].slice(4)).toEqual([null, null, null]);
	})

	it("carry each day's count, shaded against the average of the active days shown", () => {
		expect(weeks[2][0]).toEqual({ day: "2026-10-05", count: 10, level: 1 });
		expect(weeks[2][3]).toEqual({ day: TODAY, count: 30, level: 3 });
		expect(weeks[1][2]).toEqual({ day: "2026-09-30", count: 0, level: 0 });
	})
})

describe("how strongly a day is shaded", () => {
	it("runs from nothing to more than half again the usual", () => {
		expect([0, 5, 10, 20, 30, 31].map(count => levelOf(count, 20))).toEqual([0, 1, 1, 2, 3, 4]);
	})
})

describe("the months over the columns", () => {
	it("are named where each begins", () => {
		const weeks = heatmapWeeks([], TODAY, 8);
		expect(monthLabels(weeks)).toEqual(["", "", "Sep", "", "", "", "Oct", ""]);
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
