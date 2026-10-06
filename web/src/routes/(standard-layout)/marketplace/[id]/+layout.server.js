import { error } from "@sveltejs/kit"
import { pool } from "$lib/server/pool.js"
import * as marketplace from "$lib/server/marketplace.js"

export const load = async ({ params, locals }) => {
	const { rows } = await pool.query(`
		select md.id, md.name, md.theme, md.description, md.price, u.email author, count(mc.id) "cardCount",
			coalesce(md.user_id = $2::uuid, false) "isAuthor",
			${marketplace.REVIEW_COUNTS}
		from marketplace_decks md
		left join marketplace_cards mc on md.id = mc.marketplace_deck_id
		join "user" u on u.id = md.user_id
		where md.id = $1
		group by md.id, md.name, md.theme, md.description, md.price, u.email`,
		[params.id, locals.userId ?? null]
	);
	if (!rows[0]) error(404);

	return {
		mpDeck: rows[0],
		alreadyOwned: locals.userId
			? await marketplace.userHasDeckInstance(locals.userId, params.id)
			: false,
		// the page is the deck's: its name is the title
		pageTitle: rows[0].name
	}
}
