import { error } from "@sveltejs/kit"
import { pool } from "$lib/server/pool.js"
import * as marketplace from "$lib/server/marketplace.js"

export const load = async ({ params, locals }) => {
	const { rows } = await pool.query(`
		select md.id, md.name, md.theme, md.description, md.price, u.email author, count(mc.id) "cardCount"
		from marketplace_decks md
		left join marketplace_cards mc on md.id = mc.marketplace_deck_id
		join "user" u on u.id = md.user_id
		where md.id = $1
		group by md.id, md.name, md.theme, md.description, md.price, u.email`,
		[params.id]
	);
	if (!rows[0]) error(404);

	return {
		mpDeck: rows[0],
		alreadyOwned: locals.userId
			? await marketplace.userHasDeckInstance(locals.userId, params.id)
			: false,
		pageTitle: "Marketplace"
	}
}
