import { error } from "@sveltejs/kit"
import * as marketplace from "$lib/server/marketplace.js"

// the thumbnail the author's changes waiting for review would give the deck
export const GET = async ({ params, locals }) => {
	const changes = locals.userId && await marketplace.getChangeRequest(params.id);
	const image = changes?.status === "pending" && await marketplace.getChangeRequestImage(changes.id);
	if (!image || image.authorId !== locals.userId) error(404);

	return new Response(image.image, {
		headers: { "Content-Type": image.imageType, "Cache-Control": "private, no-cache" }
	});
}
