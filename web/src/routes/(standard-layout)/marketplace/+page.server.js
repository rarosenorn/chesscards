import { error } from "@sveltejs/kit"
import { pool } from "$lib/server/pool.js"
import * as marketplace from "$lib/server/marketplace.js"

export const load = async ({ url }) => {
	const theme = url.searchParams.get("theme");
	if (theme && !marketplace.themes.includes(theme)) error(404);

	const result = await pool.query(`
		select md.id, md.name, md.theme, md.price, count(mc.id) "cardCount"
		from marketplace_decks md
		left join marketplace_cards mc on md.id = mc.marketplace_deck_id
		where $1::deck_theme is null or md.theme = $1
		group by md.id, md.name, md.theme, md.price
		order by md.name`,
		[theme]
	);

	if (!result) error(500);

	return {
		mpDecks: result.rows,
		themes: marketplace.themes,
		activeTheme: theme,
		pageTitle: "Marketplace"
	}
}
