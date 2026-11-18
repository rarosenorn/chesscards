import { error } from "@sveltejs/kit"
import * as marketplace from "$lib/server/marketplace.js"

export const GET = async ({ params }) => {
	const deck = await marketplace.findDeckBySlug(params.slug);
	const image = deck && await marketplace.getDeckImage(deck.id);
	if (!image) error(404);

	return new Response(image.image, {
		headers: {
			"Content-Type": image.imageType,
			"Cache-Control": "public, max-age=3600"
		}
	});
}
