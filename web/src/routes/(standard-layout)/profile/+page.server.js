import { fail } from "@sveltejs/kit"
import { pool } from "$lib/server/pool.js"
import * as decks from "$lib/server/decks.js"
import { PIECE_SETS, BOARD_THEMES, BORDER_TYPES, ANIMATION_DURATIONS } from "$lib/board-prefs.js"

export const load = async ({ locals }) => ({
	pageTitle: "Settings",
	stageProgressionMode: await decks.getStageProgressionMode(locals.userId)
});

export const actions = {
	name: async ({ request, locals }) => {
		const data = await request.formData();
		const displayName = (data.get("display-name") ?? "").toString().trim().slice(0, 100);
		if (!displayName) return fail(400, { errors: ["A display name is required"] });
		await pool.query('update "user" set name = $1 where id = $2', [displayName, locals.userId]);
		return { saved: "name" };
	},
	// board preferences save on every change (no explicit save button)
	board: async ({ request, locals }) => {
		const data = await request.formData();
		const pieceSet = data.get("piece-set");
		const boardTheme = data.get("board-theme");
		const borderType = data.get("border-type");
		const showCoordinates = data.get("show-coordinates") === "true";
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
			     "showCoordinates" = $4, "animationDuration" = $5
			 where id = $6`,
			[pieceSet, boardTheme, borderType, showCoordinates, animationDuration, locals.userId]
		);

		return { saved: "board" };
	},
	// "all"/"none" write every deck's flag right away; "per deck" leaves the
	// decks as they are and just hands the say back to their own toggles
	stageProgression: async ({ request, locals }) => {
		const data = await request.formData();
		const mode = data.get("stage-progression-mode");
		if (!["per-deck", "all", "none"].includes(mode)) {
			return fail(400, { errors: ["Invalid chapter progression setting"] });
		}
		await decks.setStageProgressionMode(locals.userId, mode);
		return { saved: "stage-progression" };
	}
}
