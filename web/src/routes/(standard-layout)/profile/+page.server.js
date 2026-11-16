import { fail } from "@sveltejs/kit"
import { pool } from "$lib/server/pool.js"
import * as payouts from "$lib/server/payouts.js"
import { cleanName } from "$lib/display-name.js"
import { PIECE_SETS, BOARD_THEMES, BORDER_TYPES, ANIMATION_DURATIONS } from "$lib/board-prefs.js"
import { ROLLOVER_HOURS, DEFAULT_ROLLOVER_HOUR } from "$lib/rollover.js"
import { optimizeNow, lastFit, dayOf, REFIT_DAYS } from "$lib/server/fsrs-optimizer.js"

export const load = async ({ locals, cookies }) => ({
	pageTitle: "Settings",
	rolloverHour: locals.user?.rolloverHour ?? DEFAULT_ROLLOVER_HOUR,
	fsrs: { last: locals.userId ? await lastFit(locals.userId) : null, refitDays: REFIT_DAYS, timeZone: dayOf({ locals, cookies }).timeZone },
	hasPublished: locals.userId
		? (await pool.query("select 1 from marketplace_decks where user_id = $1 limit 1", [locals.userId])).rowCount > 0
		: false,
	payouts: locals.userId && await payouts.sellsDecks(locals.userId)
		? { ...await payouts.getPayoutDetails(locals.userId), ...await payouts.getEarnings(locals.userId) }
		: null
});

export const actions = {
	payoutDetails: async ({ request, locals }) => {
		if (!locals.userId || !await payouts.sellsDecks(locals.userId)) return fail(403, { failed: "payout", errors: ["Payouts are for authors of paid marketplace decks"] });
		const data = await request.formData();
		const result = await payouts.savePayoutDetails(locals.user, {
			email: data.get("payout-email"),
			name: data.get("payout-name"),
			currency: data.get("payout-currency")
		});
		if (result !== "saved" && result !== "sent") return fail(400, { failed: "payout", errors: [result] });
		return { saved: "payout" };
	},
	name: async ({ request, locals }) => {
		const data = await request.formData();
		const displayName = cleanName(data.get("display-name"));
		if (!displayName) return fail(400, { errors: ["A display name is required"], failed: "name" });
		try {
			await pool.query('update "user" set name = $1 where id = $2', [displayName, locals.userId]);
		} catch (err) {
			// user_name_key: someone has the name already, in whatever case
			if (err.code === "23505") return fail(409, { errors: ["That name is taken"], failed: "name" });
			throw err;
		}
		return { saved: "name" };
	},
	// board preferences save on every change (no explicit save button)
	board: async ({ request, locals }) => {
		const data = await request.formData();
		const pieceSet = data.get("piece-set");
		const boardTheme = data.get("board-theme");
		const borderType = data.get("border-type");
		const showCoordinates = data.get("show-coordinates") === "true";
		const highlightEveryMove = data.get("highlight-every-move") === "true";
		const animationDuration = Number(data.get("animation-duration"));

		if (
			!PIECE_SETS.includes(pieceSet)
			|| !BOARD_THEMES.includes(boardTheme)
			|| !BORDER_TYPES.includes(borderType)
			|| !ANIMATION_DURATIONS.includes(animationDuration)
		) {
			return fail(400, { failed: "board", errors: ["Invalid board settings"] });
		}

		await pool.query(
			`update "user"
			 set "pieceSet" = $1, "boardTheme" = $2, "borderType" = $3,
			     "showCoordinates" = $4, "animationDuration" = $5, "highlightEveryMove" = $7
			 where id = $6`,
			[pieceSet, boardTheme, borderType, showCoordinates, animationDuration, locals.userId, highlightEveryMove]
		);

		return { saved: "board" };
	},
	// the hour a study day begins; saves on change like the board preferences
	rollover: async ({ request, locals }) => {
		const data = await request.formData();
		const rolloverHour = Number(data.get("rollover-hour"));
		if (!ROLLOVER_HOURS.includes(rolloverHour)) {
			return fail(400, { failed: "rollover", errors: ["Invalid start of day"] });
		}
		await pool.query('update "user" set "rolloverHour" = $1 where id = $2', [rolloverHour, locals.userId]);
		return { saved: "rollover" };
	},
	// the scheduling refitted to the user's reviews now, rather than when
	// it is next due; at most once an hour
	optimize: async event => {
		const { wait, fitted } = await optimizeNow(event.locals.userId, dayOf(event));
		if (wait) {
			return fail(429, { failed: "optimize", errors: [`Parameters can be optimized once an hour. Try again in ${wait} ${wait === 1 ? "minute" : "minutes"}.`] });
		}
		if (!fitted) return fail(500, { failed: "optimize", errors: ["Optimizing failed. Try again."] });
		return { saved: "optimize" };
	}
}
