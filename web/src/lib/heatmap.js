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

// How strongly a day is shaded, as Anki's Review Heatmap add-on grades it:
// 0 for nothing, then ten steps against the usual day, from an eighth of it
// or less (1) to more than four times it (10).
const STEPS = [0.125, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4];
const levelOf = (count, usual) => {
	if (count <= 0) return 0;
	const step = STEPS.findIndex(factor => count <= factor * usual);
	return step === -1 ? STEPS.length + 1 : step + 1;
}

// The usual day, as the add-on reckons it: the answers given over all the
// days that had any, per such day. Never taken as less than 20, so the few
// reviews of someone starting out do not all come out dark.
const USUAL_FLOOR = 20;
const usualDay = counts => {
	const active = counts.filter(({ count }) => count > 0);
	const total = active.reduce((sum, { count }) => sum + count, 0);
	return Math.max(USUAL_FLOOR, Math.round(total / Math.max(active.length, 1)));
}

// Weeks as columns of seven days, Monday first, with the week `today` is in
// in the middle: `before` weeks behind it and `after` weeks ahead, as Anki's
// heatmap stands. With less history than that, it starts at the week of the
// first day anything was answered (this week, with none at all) and runs as
// many weeks in all, so the room goes to the days ahead instead of to a past
// that was never there. A day is { day, count, level, today }, its count the
// answers given on it (`counts`). A day still to come is
// { day, count, level, future: true }, its count the cards due on it
// (`forecast`). Both are shaded on the one scale, against the usual day.
const heatmapWeeks = (counts, today, before = 26, after = 26, forecast = []) => {
	const monday = day => addDays(day, -weekday(day));
	const first = counts.find(({ count }) => count > 0)?.day ?? today;
	const centred = addDays(monday(today), -before * 7);
	const start = first > centred ? monday(first > today ? today : first) : centred;
	const usual = usualDay(counts);
	const done = new Map(counts.map(({ day, count }) => [day, count]));
	const due = new Map(forecast.map(({ day, count }) => [day, count]));
	return Array.from({ length: before + 1 + after }, (_, week) => Array.from({ length: 7 }, (_, index) => {
		const day = addDays(start, week * 7 + index);
		if (day > today) {
			const count = due.get(day) ?? 0;
			return { day, count, level: levelOf(count, usual), future: true };
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

export { levelOf, usualDay, heatmapWeeks, monthLabels, sayDay, streaks }
