import { error, fail, redirect } from "@sveltejs/kit"
import * as decks from "$lib/server/decks.js"
import * as marketplace from "$lib/server/marketplace.js"
import { ttGenerateText } from "$lib/tiptap-utility.js"

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// the request is made from the deck's own listing, so a marketplace listing
// needs every part of it filled in there first
const missingFromListing = listing => [
	...(listing.name.length < 4 || listing.name.length > 100 ? ["Name must be between 4 and 100 characters"] : []),
	...(listing.imageVersion ? [] : ["A thumbnail image is required"]),
	...(listing.theme ? [] : ["A theme is required"]),
	...(listing.description && ttGenerateText(listing.description).trim().length > 0 ? [] : ["A description is required"])
];

export const load = async ({ locals, params }) => {
	// marketplace deck instances have no personal deck row: 404s for them
	const deck = await decks.getById(locals.userId, params.id);
	if (!deck) error(404);

	const uploadRequest = await marketplace.getUploadRequestForDeck(locals.userId, params.id);
	if (uploadRequest?.status === "pending" || uploadRequest?.status === "approved") {
		redirect(303, `/my-flashcards/${params.id}/settings`);
	}

	return {
		deck,
		listing: await decks.getListing(locals.userId, params.id)
	}
}

export const actions = {
	requestUpload: async ({ request, locals, params }) => {
		const data = await request.formData();

		const price = Number(data.get("price"));
		if (!Number.isFinite(price) || price < 0 || price > 999.99) {
			return fail(400, { errors: ["Price must be between 0 and 999.99"] });
		}

		let previewCardIds;
		try {
			previewCardIds = JSON.parse(data.get("previewCardIds") ?? "[]");
		} catch {
			return fail(400, { errors: ["Invalid preview card selection"] });
		}
		if (
			!Array.isArray(previewCardIds)
			|| !previewCardIds.every(id => typeof id === "string" && uuidPattern.test(id))
		) {
			return fail(400, { errors: ["Invalid preview card selection"] });
		}

		const listingErrors = missingFromListing(await decks.getListing(locals.userId, params.id));
		if (listingErrors.length > 0) {
			return fail(400, { errors: listingErrors });
		}

		try {
			await marketplace.createUploadRequest(locals.userId, params.id, { price, previewCardIds });
		} catch (err) {
			return fail(400, { errors: [err.message] });
		}
	}
}
