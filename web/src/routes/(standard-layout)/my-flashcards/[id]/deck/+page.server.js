import { error, fail } from "@sveltejs/kit"
import * as decks from "$lib/server/decks.js"
import * as marketplace from "$lib/server/marketplace.js"
import { sideHasContent } from "$lib/card-utils.js"

export const load = async ({ locals, params, parent }) => {
	// a marketplace deck instance shows the listing it was bought from
	const { deck } = await parent();
	const listing = deck.isMarketplace
		? await marketplace.getInstanceListing(locals.userId, params.id)
		: await decks.getListing(locals.userId, params.id);

	// the sample cards as the marketplace shows them, in their order
	const sampleCards = deck.isMarketplace
		? await marketplace.getDeckPreviewCards(listing.marketplaceDeckId)
		: listing.previewCardIds
			.map(id => deck.cards.find(card => card.id === id))
			.filter(card => card !== undefined);

	return {
		pageTitle: "Deck",
		listing,
		sampleCards,
		themes: marketplace.themes
	}
}

export const actions = {
	// only the deck's own listing: a listing already on the marketplace keeps
	// what it was approved with
	save: async ({ request, locals, params }) => {
		const data = await request.formData();

		const name = data.get("name")?.toString().trim();
		if (!name || name.length < 4 || name.length > 100) {
			return fail(400, { errors: ["Name must be between 4 and 100 characters"] });
		}

		const theme = data.get("theme") || null;
		if (theme !== null && !marketplace.themes.includes(theme)) {
			return fail(400, { errors: ["Choose a valid theme"] });
		}

		// blocks, like a card's side; an empty one is no description
		let description;
		try {
			description = JSON.parse(data.get("description") ?? "[]");
		} catch {
			return fail(400, { errors: ["Invalid description"] });
		}
		if (!Array.isArray(description)) {
			return fail(400, { errors: ["Invalid description"] });
		}
		if (!sideHasContent(description)) description = null;

		const image = data.get("image");
		const hasImage = image instanceof File && image.size > 0;
		if (hasImage && !["image/jpeg", "image/png", "image/webp"].includes(image.type)) {
			return fail(400, { errors: ["Image must be jpeg, png or webp"] });
		}
		if (hasImage && image.size > 2 * 1024 * 1024) {
			return fail(400, { errors: ["Image must be smaller than 2MB"] });
		}

		try {
			const updated = await decks.updateListing(locals.userId, params.id, {
				name,
				description,
				theme,
				image: hasImage ? Buffer.from(await image.arrayBuffer()) : null,
				imageType: hasImage ? image.type : null
			});
			if (!updated) error(404);
		} catch (err) {
			if (err.code === "23505") {
				return fail(409, { errors: ["You already have a deck with this name"] });
			}
			throw err;
		}
	}
}
