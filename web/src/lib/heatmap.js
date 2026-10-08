// The activity heatmap: a square for each study day of the last year, month
// by month in columns of weeks, shaded by how much was answered that day. Days are
// 'YYYY-MM-DD' strings throughout (the server says which day an answer and
// "today" fall in), reckoned here as plain calendar dates.

const DAY_MS = 24 * 60 * 60 * 1000;
const parse = day => Date.parse(day + "T00:00:00Z");
const addDays = (day, n) => new Date(parse(day) + n * DAY_MS).toISOString().slice(0, 10);
// Monday 0 to Sunday 6
const weekday = day => (new Date(parse(day)).getUTCDay() + 6) % 7;

// How strongly a day is shaded, 0 (nothing answered) to 4, against the
// average of the days that had anything: half the usual or less is the
// lightest, more than half again the usual the darkest. Against the average
// rather than the best day, so one long session does not fade all the rest.
const levelOf = (count, average) =>
	count <= 0 ? 0 : count <= average * 0.5 ? 1 : count <= average ? 2 : count <= average * 1.5 ? 3 : 4;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const two = n => String(n).padStart(2, "0");

// The last `months` months, the one `today` is in last, each standing on
// its own: { label, weeks }, the label "Oct '26", the weeks columns of
// seven (Monday first) that hold that month's days only, null wherever a
// column's day belongs to the month before or after. A day is
// { day, count, level }, with `today` on the day it is; a day of this month
// still to come is { day, future: true }.
const heatmapMonths = (counts, today, months = 12) => {
	const byDay = new Map(counts.map(({ day, count }) => [day, count]));
	const [year, month] = today.split("-").map(Number);
	const firsts = Array.from({ length: months }, (_, index) =>
		new Date(Date.UTC(year, month - months + index, 1)));
	const start = firsts[0].toISOString().slice(0, 10);
	const shown = counts.filter(({ day, count }) => day >= start && day <= today && count > 0);
	const average = shown.length ? shown.reduce((sum, { count }) => sum + count, 0) / shown.length : 0;

	return firsts.map(first => {
		const y = first.getUTCFullYear(), m = first.getUTCMonth();
		const length = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
		// how far down its first column the month begins
		const offset = weekday(first.toISOString().slice(0, 10));
		const weeks = Array.from({ length: Math.ceil((offset + length) / 7) }, (_, week) =>
			Array.from({ length: 7 }, (_, index) => {
				const date = week * 7 + index - offset + 1;
				if (date < 1 || date > length) return null;
				const day = `${y}-${two(m + 1)}-${two(date)}`;
				if (day > today) return { day, future: true };
				const count = byDay.get(day) ?? 0;
				return { day, count, level: levelOf(count, average), today: day === today };
			}));
		return { label: `${MONTHS[m]} '${two(y % 100)}`, weeks };
	});
}

// a day as it is said in a square's tooltip: 8 Oct 2026
const sayDay = day => `${Number(day.slice(8))} ${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`;

// What the line under the squares says: how much was answered in the year
// shown, the run of days in a row that is still going (a day not yet
// studied does not break it until it is over), and the longest there has
// been.
const streaks = (counts, today) => {
	const active = counts.filter(({ count }) => count > 0).map(({ day }) => day);
	const days = new Set(active);
	let longest = 0, run = 0, previous = null;
	for (const day of active) {
		run = previous && addDays(previous, 1) === day ? run + 1 : 1;
		longest = Math.max(longest, run);
		previous = day;
	}
	let current = 0;
	for (let day = days.has(today) ? today : addDays(today, -1); days.has(day); day = addDays(day, -1)) current++;
	const yearAgo = addDays(today, -365);
	const total = counts.reduce((sum, { day, count }) => day > yearAgo && day <= today ? sum + count : sum, 0);
	return { total, current, longest };
}

export { levelOf, heatmapMonths, sayDay, streaks }
