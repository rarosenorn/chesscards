import { error } from "@sveltejs/kit"
import { pool } from "$lib/server/pool.js"

export const load = async () => {
	const result = await pool.query(`select md.name, md.id, json_agg(json_build_object('id', mc.id, 'front', mc.front, 'back', mc.back)) \"marketplaceCards\" from marketplace_decks md left join marketplace_cards mc on md.id = mc.marketplace_deck_id group by md.id, md.name;`);

	if (!result) error(500);

	return { 
		mpDecks: result.rows,
		pageTitle: "Marketplace" 
	}
}
