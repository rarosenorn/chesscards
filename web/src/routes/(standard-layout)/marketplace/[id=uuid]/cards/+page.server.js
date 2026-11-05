import * as marketplace from "$lib/server/marketplace.js"

export const load = async ({ params, parent }) => {
	// see the overview's load: the layout decides who may see the deck
	await parent();
	return {
		previewCards: await marketplace.getDeckPreviewCards(params.id)
	}
}
