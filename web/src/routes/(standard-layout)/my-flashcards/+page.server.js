import * as decks from "$lib/server/decks.js"
import * as activity from "$lib/server/activity.js"
import { DEFAULT_ROLLOVER_HOUR, TZ_COOKIE } from "$lib/rollover.js"

const load = async ({ locals, cookies }) => {
	// the day boundary these counts are read against: the user's hour, in the
	// zone the browser left behind (rollover.js). A first visit has no cookie
	// yet, and falls back to the server's own zone for that one render.
	const when = {
		timeZone: cookies.get(TZ_COOKIE) || Intl.DateTimeFormat().resolvedOptions().timeZone,
		rolloverHour: locals.user?.rolloverHour ?? DEFAULT_ROLLOVER_HOUR
	};
	return {
		// every deck of the user's, their own and the marketplace decks they
		// have taken, as one tree in reading order (decks.getListing); they
		// are made and arranged through decks.remote.js
		decks: await decks.getListing(locals.userId, when),
		activity: await activity.getDailyCounts(locals.userId, when),
		pageTitle: "My flashcards"
	}
}

export { load }
