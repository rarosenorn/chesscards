import { error, fail, redirect } from "@sveltejs/kit"
import * as decks from "$lib/server/decks.js"
import * as marketplace from "$lib/server/marketplace.js"

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
		if (!Number.isFinite(price) || price < 0 || price > 999.99) {
			return fail(400, { errors: ["Price must be between 0 and 999.99"] });
		}

		let description;
		try {
			description = JSON.parse(data.get("description"));
		} catch {
			return fail(400, { errors: ["Invalid description"] });
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

		const image = data.get("image");
		if (!(image instanceof File) || image.size === 0) {
			return fail(400, { errors: ["A thumbnail image is required"] });
		}
		if (!["image/jpeg", "image/png", "image/webp"].includes(image.type)) {
			return fail(400, { errors: ["Image must be jpeg, png or webp"] });
		}
		if (image.size > 2 * 1024 * 1024) {
			return fail(400, { errors: ["Image must be smaller than 2MB"] });
		}

		try {
			await marketplace.createUploadRequest(locals.userId, params.id, {
				name,
				description,
				theme,
				price,
				image: Buffer.from(await image.arrayBuffer()),
				imageType: image.type,
				previewCardIds
			});
		} catch (err) {
			return fail(400, { errors: [err.message] });
		}
	}
}
