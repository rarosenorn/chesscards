import { describe, it, expect } from "vitest"
import { levelOf, usualDay, heatmapWeeks, monthLabels, sayDay, streaks } from "./heatmap.js"

// 2026-10-08 is a Thursday
const TODAY = "2026-10-08";

describe("the weeks shown", () => {
	// a history going back further than the weeks shown
	const OLD = { day: "2026-01-05", count: 20 };
	const weeks = heatmapWeeks([OLD, { day: "2026-10-05", count: 10 }, { day: "2026-10-08", count: 30 }], TODAY, 2, 2);

	it("are columns of seven days from Monday, this week in the middle", () => {
		expect(weeks.length).toBe(5);
		expect(weeks[0][0].day).toBe("2026-09-21");
		expect(weeks[2][0].day).toBe("2026-10-05");
		expect(weeks[2][3].day).toBe(TODAY);
		expect(weeks[4][6].day).toBe("2026-10-25");
	})

	it("show the days still to come as such", () => {
		expect(weeks[2].slice(4)).toEqual([
			{ day: "2026-10-09", count: 0, level: 0, future: true },
			{ day: "2026-10-10", count: 0, level: 0, future: true },
			{ day: "2026-10-11", count: 0, level: 0, future: true }
		]);
		expect(weeks[3].every(cell => cell.future)).toBe(true);
	})

	it("carry each day's count, shaded against the usual day (20 here), and mark today", () => {
		expect(weeks[2][0]).toEqual({ day: "2026-10-05", count: 10, level: 3, today: false });
		expect(weeks[2][3]).toEqual({ day: TODAY, count: 30, level: 7, today: true });
		expect(weeks[1][2]).toEqual({ day: "2026-09-30", count: 0, level: 0, today: false });
	})

	it("give a day to come the cards due on it, on the same scale", () => {
		const forecast = [{ day: "2026-10-09", count: 5 }, { day: "2026-10-12", count: 90 }, { day: TODAY, count: 99 }];
		const ahead = heatmapWeeks([OLD], TODAY, 2, 2, forecast);
		expect(ahead[2][4]).toEqual({ day: "2026-10-09", count: 5, level: 2, future: true });
		expect(ahead[3][0]).toEqual({ day: "2026-10-12", count: 90, level: 10, future: true });
		// today is a day gone by here: what was answered, not what is due
		expect(ahead[2][3]).toEqual({ day: TODAY, count: 0, level: 0, today: true });
	})
})

describe("with less history than the weeks behind today", () => {
	it("starts at the week of the first day studied, and runs as many weeks in all", () => {
		const weeks = heatmapWeeks([{ day: "2026-10-01", count: 5 }, { day: TODAY, count: 5 }], TODAY, 26, 26);
		expect(weeks.length).toBe(53);
		expect(weeks[0][0].day).toBe("2026-09-28");
		expect(weeks[0][3]).toMatchObject({ day: "2026-10-01", count: 5 });
		expect(weeks[1][3]).toMatchObject({ day: TODAY, today: true });
		expect(weeks[52][6]).toMatchObject({ day: "2027-10-03", future: true });
	})

	it("starts at this week when nothing has been studied yet", () => {
		const weeks = heatmapWeeks([], TODAY, 26, 26);
		expect(weeks[0][0].day).toBe("2026-10-05");
		expect(weeks[0][3]).toMatchObject({ day: TODAY, today: true });
		expect(weeks.length).toBe(53);
	})
})

describe("the usual day", () => {
	it("is the answers per day that had any, over all there is", () => {
		expect(usualDay([{ day: "2020-01-01", count: 100 }, { day: "2026-10-01", count: 50 }, { day: "2026-10-02", count: 0 }])).toBe(75);
	})

	it("is never taken as less than 20", () => {
		expect(usualDay([{ day: "2026-10-01", count: 3 }])).toBe(20);
		expect(usualDay([])).toBe(20);
	})
})

describe("the months named at the columns", () => {
	it("stand where each begins, with the year", () => {
		const old = [{ day: "2020-01-01", count: 1 }];
		expect(monthLabels(heatmapWeeks(old, TODAY, 6, 1))).toEqual(["", "Sep '26", "", "", "", "Oct '26", "", ""]);
		expect(monthLabels(heatmapWeeks(old, "2026-01-10", 2, 0))).toEqual(["", "Jan '26", ""]);
	})
})

describe("how strongly a day is shaded", () => {
	it("runs in ten steps from an eighth of the usual day to more than four times it", () => {
		expect([0, 2, 5, 10, 15, 20, 25, 30, 40, 80, 81].map(count => levelOf(count, 20)))
			.toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
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
