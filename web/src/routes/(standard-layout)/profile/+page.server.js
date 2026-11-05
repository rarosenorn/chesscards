import { fail } from "@sveltejs/kit"
import { pool } from "$lib/server/pool.js"
import { cleanName } from "$lib/display-name.js"
import { PIECE_SETS, BOARD_THEMES, BORDER_TYPES, ANIMATION_DURATIONS } from "$lib/board-prefs.js"
import { ROLLOVER_HOURS, DEFAULT_ROLLOVER_HOUR } from "$lib/rollover.js"

export const load = async ({ locals }) => ({
	pageTitle: "Settings",
	rolloverHour: locals.user?.rolloverHour ?? DEFAULT_ROLLOVER_HOUR,
	hasPublished: locals.userId
		? (await pool.query("select 1 from marketplace_decks where user_id = $1 limit 1", [locals.userId])).rowCount > 0
		: false
});

export const actions = {
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
			return fail(400, { errors: ["Invalid board settings"] });
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
			return fail(400, { errors: ["Invalid start of day"] });
		}
		await pool.query('update "user" set "rolloverHour" = $1 where id = $2', [rolloverHour, locals.userId]);
		return { saved: "rollover" };
	}
}
