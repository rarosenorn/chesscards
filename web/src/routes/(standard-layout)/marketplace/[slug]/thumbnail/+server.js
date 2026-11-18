import { error } from "@sveltejs/kit"
import * as marketplace from "$lib/server/marketplace.js"

// as the deck's page: off sale or taken down, only for those who have it
export const GET = async ({ params, locals }) => {
	const deck = await marketplace.findDeckBySlug(params.slug);
	const image = deck && await marketplace.getDeckImage(deck.id);
	if (!image) error(404);
	const shown = image.forSale || locals.isAdmin
		|| (locals.userId && (await marketplace.getOwnership(locals.userId, deck.id)).owned);
	if (!shown) error(404);

	return new Response(image.image, {
		headers: {
			"Content-Type": image.imageType,
			"Cache-Control": `${image.forSale ? "public" : "private"}, max-age=3600`
		}
	});
}
