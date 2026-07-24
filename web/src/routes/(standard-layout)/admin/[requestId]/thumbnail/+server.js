import { error } from "@sveltejs/kit"
import * as marketplace from "$lib/server/marketplace.js"

// admin-only: /admin/* is guarded in hooks.server.js
export const GET = async ({ params }) => {
	const image = await marketplace.getUploadRequestImage(params.requestId);
	if (!image) error(404);

	return new Response(image.image, {
		headers: { "Content-Type": image.imageType }
	});
}
