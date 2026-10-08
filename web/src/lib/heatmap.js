// The activity heatmap: a square for each study day of the last year, in
// columns of weeks, shaded by how much was answered that day. Days are
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

// The last `weeks` weeks as columns of seven days, Monday first, the last
// column the week `today` is in. Each day is { day, count, level }; the days
// of that week still to come are null.
const heatmapWeeks = (counts, today, weeks = 53) => {
	const byDay = new Map(counts.map(({ day, count }) => [day, count]));
	const start = addDays(today, -weekday(today) - (weeks - 1) * 7);
	const shown = counts.filter(({ day, count }) => day >= start && day <= today && count > 0);
	const average = shown.length ? shown.reduce((sum, { count }) => sum + count, 0) / shown.length : 0;
	return Array.from({ length: weeks }, (_, week) => Array.from({ length: 7 }, (_, index) => {
		const day = addDays(start, week * 7 + index);
		if (day > today) return null;
		const count = byDay.get(day) ?? 0;
		return { day, count, level: levelOf(count, average) };
	}));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The month named over a column: over the first column a month begins in
// (the one holding its 1st), and over no other.
const monthLabels = columns => columns.map(column => {
	const first = column.find(cell => cell?.day.endsWith("-01"));
	return first ? MONTHS[Number(first.day.slice(5, 7)) - 1] : "";
});

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

export { levelOf, heatmapWeeks, monthLabels, sayDay, streaks }
