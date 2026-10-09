import { error } from "@sveltejs/kit"
import { pool } from "$lib/server/pool.js"
import * as marketplace from "$lib/server/marketplace.js"

export const load = async ({ url, locals }) => {
	const theme = url.searchParams.get("theme");
	if (theme && !marketplace.themes.includes(theme)) error(404);

	const result = await pool.query(`
		select md.id, md.name, md.theme, md.price, u.name author, count(mc.id) "cardCount",
			exists (select 1 from marketplace_deck_instances i
				where i.marketplace_deck_id = md.id and i.user_id = $2::uuid) owned,
			${marketplace.REVIEW_COUNTS}
		from marketplace_decks md
		join "user" u on u.id = md.user_id
		left join marketplace_cards mc on md.id = mc.marketplace_deck_id
		where $1::deck_theme is null or md.theme = $1
		group by md.id, md.name, md.theme, md.price, u.name
		order by md.name`,
		[theme, locals.userId ?? null]
	);

	if (!result) error(500);

	return {
		mpDecks: result.rows,
		themes: marketplace.themes,
		activeTheme: theme,
		pageTitle: "Marketplace"
	}
}
