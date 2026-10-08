import { error } from "@sveltejs/kit"
import * as decks from "$lib/server/decks.js"

// the Deck tab asks with the image's hash in the url, so a new image is a new
// url and the old one can be cached for good
export const GET = async ({ params, locals }) => {
	const image = await decks.getImage(locals.userId, params.id);
	if (!image) error(404);

	return new Response(image.image, {
		headers: {
			"Content-Type": image.imageType,
			"Cache-Control": "private, max-age=31536000, immutable"
		}
	});
}
