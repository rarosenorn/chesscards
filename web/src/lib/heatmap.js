// The activity heatmap: a square for each study day, half a year back and
// half a year ahead, in columns of weeks. A day gone by is shaded by how
// much was answered on it, a day to come by how many cards fall due on it. Days are
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

// Weeks as columns of seven days, Monday first, with the week `today` is in
// in the middle: `before` weeks behind it and `after` weeks ahead, as Anki's
// heatmap stands. A day is { day, count, level, today }, its count the
// answers given on it (`counts`). A day still to come is
// { day, count, level, future: true }, its count the cards due on it
// (`forecast`), shaded against the average of the days ahead that have any.
const heatmapWeeks = (counts, today, before = 26, after = 26, forecast = []) => {
	const start = addDays(today, -weekday(today) - before * 7);
	const end = addDays(start, (before + 1 + after) * 7 - 1);
	const average = days => days.length ? days.reduce((sum, { count }) => sum + count, 0) / days.length : 0;
	const done = new Map(counts.map(({ day, count }) => [day, count]));
	const usual = average(counts.filter(({ day, count }) => day >= start && day <= today && count > 0));
	const due = new Map(forecast.map(({ day, count }) => [day, count]));
	const usualDue = average(forecast.filter(({ day, count }) => day > today && day <= end && count > 0));
	return Array.from({ length: before + 1 + after }, (_, week) => Array.from({ length: 7 }, (_, index) => {
		const day = addDays(start, week * 7 + index);
		if (day > today) {
			const count = due.get(day) ?? 0;
			return { day, count, level: levelOf(count, usualDue), future: true };
		}
		const count = done.get(day) ?? 0;
		return { day, count, level: levelOf(count, usual), today: day === today };
	}));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The month named at a column, as "Oct '26": at the first column a month
// begins in (the one holding its 1st), and at no other.
const monthLabels = columns => columns.map(column => {
	const first = column.find(cell => cell?.day.endsWith("-01"));
	return first ? `${MONTHS[Number(first.day.slice(5, 7)) - 1]} '${first.day.slice(2, 4)}` : "";
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
