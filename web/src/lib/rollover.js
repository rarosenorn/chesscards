// The day boundary a schedule is read against.
//
// Anki's rule, which we follow: a card whose interval crosses a day boundary
// "will appear at the start of the day they are scheduled for" — so a card
// graded at 10pm with a one-day interval is waiting at 4am that night, not at
// 10pm tomorrow. A learning step that runs past the next boundary goes the
// same way, as in Anki (it becomes a "day learn" card): graded at 8pm, a
// 23-hour step is waiting at 4am, not at 7pm tomorrow. Only steps that end
// within the day they were graded in keep their exact times.
//
// The hour is the user's ("next day starts at", 4am in Anki). It sits a few
// hours past midnight so that studying late at night is still the same day's
// session, rather than two days' cards in one sitting.
const DEFAULT_ROLLOVER_HOUR = 4;

// Where the browser leaves its IANA zone for the server (see the root layout).
// The study page reads a due date in the browser and knows the zone outright;
// the deck list's counts are a SQL aggregate, and the server has no one to ask.
const TZ_COOKIE = "cc_tz";

// what the Settings control offers: the small hours, where a boundary falls
// between going to bed and getting up for most people
const ROLLOVER_HOURS = [1, 2, 3, 4, 5, 6];

// a day-scale card: scheduled a day or more after the review that set it, or
// past the end of the rollover day that review fell in. Everything else is a
// learning step within its day, which is due to the minute. A card never
// reviewed has no interval to speak of — it is new, and new cards are due the
// moment their deck lets them through.
const DAY_MS = 24 * 60 * 60 * 1000;
const crossesDay = (card, hour = DEFAULT_ROLLOVER_HOUR) => {
	if (card.last_review == null) return false;
	const due = Date.parse(card.due);
	const reviewed = Date.parse(card.last_review);
	return due - reviewed >= DAY_MS || due >= dayEnd(reviewed, hour);
}

// The end of the rollover day holding `at`: the next boundary. A day-scale
// card is due once the day it falls in has begun, which is the same as saying
// its due instant lies before this.
const dayEnd = (at, hour = DEFAULT_ROLLOVER_HOUR) => {
	const t = new Date(at);
	const boundary = new Date(t);
	boundary.setHours(hour, 0, 0, 0);
	// before this morning's boundary we are still in yesterday's day
	if (t < boundary) boundary.setDate(boundary.getDate() - 1);
	boundary.setDate(boundary.getDate() + 1);
	return boundary.getTime();
}

// ...and the start of it, for reading a due date as "which day is this for"
const dayStart = (at, hour = DEFAULT_ROLLOVER_HOUR) => dayEnd(at, hour) - DAY_MS;

// When the card actually arrives — the instant isDueAt below starts saying
// yes. A day-scale card arrives at the start of the rollover day its due
// falls in, which is NOT the same calendar day when the due time lands in the
// small hours: a card due at 2am belongs to the day that began at 4am
// yesterday. Anything that tells the user when to expect a card has to say
// this, not the raw timestamp.
const availableAt = (card, hour = DEFAULT_ROLLOVER_HOUR) =>
	crossesDay(card, hour) ? dayStart(Date.parse(card.due), hour) : Date.parse(card.due);

// is this card's time up, as of `now`?
const isDueAt = (card, now, hour = DEFAULT_ROLLOVER_HOUR) =>
	crossesDay(card, hour)
		? Date.parse(card.due) < dayEnd(now, hour)
		: Date.parse(card.due) <= now;

// Anki's learn-ahead limit: a learning step this close is within the
// session's reach, so it is counted as waiting — in the deck list as in
// study — and study shows it early once nothing else is left. Only the short
// steps are reached for: a day-scale card already waits for its boundary, and
// reaching past that would be handing over tomorrow.
const LEARN_AHEAD_MS = 20 * 60 * 1000;
const isDueSoonAt = (card, now, hour = DEFAULT_ROLLOVER_HOUR) =>
	!crossesDay(card, hour) && Date.parse(card.due) <= now + LEARN_AHEAD_MS;

export { DEFAULT_ROLLOVER_HOUR, TZ_COOKIE, ROLLOVER_HOURS, DAY_MS, LEARN_AHEAD_MS, crossesDay, dayStart, dayEnd, availableAt, isDueAt, isDueSoonAt }
