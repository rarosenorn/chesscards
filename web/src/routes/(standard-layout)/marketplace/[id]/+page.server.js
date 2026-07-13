import { error } from "@sveltejs/kit"
import { pool } from "$lib/server/pool.js"

export const load = async ({ params }) => {
	const result = await pool.query(`select mpd.id, mpd.name, json_agg(json_build_object('id', mpc.id, 'front', mpc.front, 'back', mpc.back)) from marketplace_decks mpd left join marketplace_cards mpc on mpd.id = mpc.marketplace_deck_id where mpd.id = $1 group by mpd.id, mpd.name;`, 
	[params.id])

	if (!result) {
		error(500);
	}
	if (!result.rows[0]) {
		error(404);
	}

	return {
		mpDeck: result.rows[0]
	}
}
