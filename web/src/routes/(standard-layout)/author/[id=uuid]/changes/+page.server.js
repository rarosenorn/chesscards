import { error, fail } from "@sveltejs/kit"
import * as marketplace from "$lib/server/marketplace.js"
import { sideHasContent } from "$lib/card-utils.js"

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const load = async ({ locals, params }) => {
	const deck = locals.userId && await marketplace.getDeckForChanges(locals.userId, params.id);
	if (!deck) error(404);
	const changes = await marketplace.getChangeRequest(params.id);
	return {
		pageTitle: `Request changes: ${deck.name}`,
		deck,
		cards: await marketplace.getDeckCards(params.id),
		// asking again starts from the changes waiting
		pending: changes?.status === "pending" ? changes : null
	};
}

export const actions = {
	requestChanges: async ({ request, locals, params }) => {
		const data = await request.formData();

		const name = data.get("name")?.toString().trim();
		if (!name || name.length < 4 || name.length > 100) {
			return fail(400, { errors: ["Name must be between 4 and 100 characters"] });
		}

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
			return fail(400, { errors: ["Invalid sample card selection"] });
		}
		if (!Array.isArray(previewCardIds) || !previewCardIds.every(id => typeof id === "string" && uuidPattern.test(id))) {
			return fail(400, { errors: ["Invalid sample card selection"] });
		}

		const image = data.get("image");
		const hasImage = image instanceof File && image.size > 0;
		if (hasImage && !["image/jpeg", "image/png", "image/webp"].includes(image.type)) {
			return fail(400, { errors: ["Image must be jpeg, png or webp"] });
		}
		if (hasImage && image.size > 2 * 1024 * 1024) {
			return fail(400, { errors: ["Image must be smaller than 2MB"] });
		}

		let requested;
		try {
			requested = locals.userId && await marketplace.requestChanges(locals.userId, params.id, {
				name,
				description,
				image: hasImage ? Buffer.from(await image.arrayBuffer()) : null,
				imageType: hasImage ? image.type : null,
				keepPendingImage: data.get("keepPendingImage") === "true",
				previewCardIds
			});
		} catch (err) {
			// a database error (it has a code) is not the author's to read
			if (err.code) throw err;
			return fail(400, { errors: [err.message] });
		}
		if (!requested) error(404);
	}
}
