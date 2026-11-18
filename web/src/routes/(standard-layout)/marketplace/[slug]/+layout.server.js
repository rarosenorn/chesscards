import { error, redirect } from "@sveltejs/kit"
import { pool } from "$lib/server/pool.js"
import * as marketplace from "$lib/server/marketplace.js"

export const load = async ({ params, locals, url }) => {
	const found = await marketplace.findDeckBySlug(params.slug);
	if (!found) error(404);
	const { rows } = await pool.query(`
		select md.id, md.slug, md.name, md.theme, md.description, md.price, coalesce(u.name, md.author_name) author, count(mc.id) "cardCount",
			md.on_sale "onSale", md.taken_down_reason "takenDownReason",
			${marketplace.FOR_SALE} "forSale",
			coalesce(md.user_id = $2::uuid, false) "isAuthor",
			${marketplace.REVIEW_COUNTS}
		from marketplace_decks md
		left join marketplace_cards mc on md.id = mc.marketplace_deck_id
		left join "user" u on u.id = md.user_id
		where md.id = $1
		group by md.id, u.name`,
		[found.id, locals.userId ?? null]
	);
	if (!rows[0]) error(404);
	const ownership = locals.userId
		? await marketplace.getOwnership(locals.userId, found.id)
		: { owned: false, inLibrary: false };
	const mpDeck = rows[0];
	if (!mpDeck.forSale && !ownership.owned && !locals.isAdmin) error(404);
	// temporary, since another deck may take the old name
	if (!found.current) {
		const path = ["marketplace", encodeURIComponent(found.slug), ...url.pathname.split("/").slice(3)];
		redirect(302, `/${path.join("/")}${url.search}`);
	}
	if (!mpDeck.isAuthor && !locals.isAdmin) mpDeck.takenDownReason = null;

	return {
		mpDeck,
		ownership,
		renameRequest: mpDeck.isAuthor ? await marketplace.getRenameRequest(found.id) : undefined,
		// the page is the deck's: its name is the title
		pageTitle: mpDeck.name
	}
}
