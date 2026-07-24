import * as marketplace from "$lib/server/marketplace.js"

export const load = async ({ params }) => {
	return {
		previewCards: await marketplace.getDeckPreviewCards(params.id)
	}
}
