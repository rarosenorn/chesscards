import { error } from "@sveltejs/kit"
import * as marketplace from "$lib/server/marketplace.js"

export const GET = async ({ params }) => {
	const image = await marketplace.getDeckImage(params.id);
	if (!image) error(404);

	return new Response(image.image, {
		headers: {
			"Content-Type": image.imageType,
			"Cache-Control": "public, max-age=3600"
		}
	});
}
