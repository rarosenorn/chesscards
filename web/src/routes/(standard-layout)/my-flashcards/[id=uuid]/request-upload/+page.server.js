import { error, fail, redirect } from "@sveltejs/kit"
import * as decks from "$lib/server/decks.js"
import * as marketplace from "$lib/server/marketplace.js"
import { sideHasContent } from "$lib/card-utils.js"

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const load = async ({ locals, params }) => {
	// only a deck of the user's own can be published, and not one with a
	// marketplace deck they have taken inside it
	const deck = await decks.getDeck(locals.userId, params.id);
	if (!deck || deck.isMarketplace) error(404);
	const listing = await decks.getOwnListing(locals.userId, params.id);
	if (listing.holdsTaken) redirect(303, `/my-flashcards/${params.id}/settings`);

	const uploadRequest = await marketplace.getUploadRequestForDeck(locals.userId, params.id);
	if (uploadRequest?.status === "pending" || uploadRequest?.status === "approved") {
		redirect(303, `/my-flashcards/${params.id}/settings`);
	}

	// the request starts as the deck's own listing
	return {
		deck,
		listing,
		themes: marketplace.themes
	}
}

export const actions = {
	requestUpload: async ({ request, locals, params }) => {
		const data = await request.formData();

		const name = data.get("name")?.toString().trim();
		if (!name || name.length < 4 || name.length > 100) {
			return fail(400, { errors: ["Name must be between 4 and 100 characters"] });
		}

		const theme = data.get("theme");
		if (!marketplace.themes.includes(theme)) {
			return fail(400, { errors: ["Choose a valid theme"] });
		}

		const price = Number(data.get("price"));
		if (!Number.isFinite(price) || (price !== 0 && (price < 2 || price > 200))) {
			return fail(400, { errors: ["Price must be 0 (free) or from $2 to $200"] });
		}

		// blocks, like a card's side
		let description;
		try {
			description = JSON.parse(data.get("description"));
		} catch {
			return fail(400, { errors: ["Invalid description"] });
		}
		if (!Array.isArray(description) || !sideHasContent(description)) {
			return fail(400, { errors: ["A description is required"] });
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

		// no image is the deck's own thumbnail
		const image = data.get("image");
		const hasImage = image instanceof File && image.size > 0;
		if (hasImage && !["image/jpeg", "image/png", "image/webp"].includes(image.type)) {
			return fail(400, { errors: ["Image must be jpeg, png or webp"] });
		}
		if (hasImage && image.size > 2 * 1024 * 1024) {
			return fail(400, { errors: ["Image must be smaller than 2MB"] });
		}

		try {
			await marketplace.createUploadRequest(locals.userId, params.id, {
				name,
				description,
				theme,
				price,
				image: hasImage ? Buffer.from(await image.arrayBuffer()) : null,
				imageType: hasImage ? image.type : null,
				previewCardIds
			});
		} catch (err) {
			return fail(400, { errors: [err.message] });
		}
	}
}
