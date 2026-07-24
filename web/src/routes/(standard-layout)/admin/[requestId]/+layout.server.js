import { error } from "@sveltejs/kit"
import * as marketplace from "$lib/server/marketplace.js"

export const load = async ({ params }) => {
	const request = await marketplace.getUploadRequestWithCards(params.requestId);
	if (!request) error(404);

	return {
		pageTitle: "Review upload request",
		request
	}
}
